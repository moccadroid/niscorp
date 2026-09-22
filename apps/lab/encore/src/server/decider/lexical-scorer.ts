import type { Question } from '@niscorp/signal';

// ═══════════════════════════════════════════════════════════
// THE FAKE'S BRAIN — a lexical scorer, and nothing smarter.
//
// It exists so every check is deterministic and offline, and so the pacing can
// be felt without a key. It is NOT a model and must never be tuned until it
// looks like one: the claim this app makes is about what a real decision model
// does with derived questions, and a fake that quietly grew domain knowledge
// would be proving itself instead.
//
// So it knows about WORDS, and only words:
//
//   overlap   a state token counts toward an option when it equals one of the
//             option's tokens, or is a prefix of one — "headl" is most of the
//             way to "headliner", and the score says so, which is what makes a
//             card go chip → mounted as a word completes.
//   rarity    a token that matches every option tells them apart from nothing;
//             its weight is split across what it matched.
//   direction "to the tent" and "from the tent" are different sentences. A
//             match right after `to`/`from` counts fully for a question whose
//             own wording carries that word, barely for one carrying the
//             opposite, and at half weight for one carrying neither.
//   none      every choice is scored against a standing prior for `none`, so
//             an empty line — or a line about something else — answers `none`.
//             A choice with no `none` gives that prior to its FIRST option: the
//             asker lists the fallback first.
//   (changed  REMOVED 2026-09-21. This scorer used to down-weight a match that a
//   mind)     correction word took back — and that cue was the only reason "to
//             the tent no the grove" worked: the real model left To = The Tent.
//             A correction is now READ by a lane (intent/supersede.ts) and the
//             row taken back never reaches any decider as an option. The fake
//             has no opinion about "no" any more, so the checks prove the lane.
//   middling  a real decision model almost never says zero. With `noulFloor`
//             set, every yes/no answer is lifted onto [floor, 1], so an
//             unrelated card is a 0.4 guess instead of nothing — and a rule
//             that quietly relied on zeros fails HERE, in a check, instead of
//             in front of somebody on the calibrated model.
//   families  a question's name is `<family>/<rest>`, and rarity is counted
//             within a family: a word that lights one card is discounted for
//             lighting other CARDS, not for also naming a context to fetch.
//
// It has never heard of a festival. Every word it matches arrived in the
// request.
// ═══════════════════════════════════════════════════════════

// Function words. Dropped from BOTH sides: "the" matching "The Tent" is not
// evidence of anything.
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'at', 'in', 'on', 'for', 'with', 'by', 'is', 'it', 'its', 'this', 'that', 'be', 'as', 'are', 'was',
  'every', 'each', 'all', 'any', 'some', 'one', 'when', 'open', 'such', 'whether', 'will', 'them', 'their', 'they', 'who', 'what', 'which', 'how', 'not', 'no', 'none', 'these', 'about',
]);

// Direction words are neither content nor noise: they are read as a cue on the
// content token that follows them.
const DIRECTIONS: ReadonlySet<string> = new Set(['to', 'from', 'into', 'onto']);
const DIRECTION_FAMILY: Record<string, string> = { to: 'to', into: 'to', onto: 'to', from: 'from' };

// How far back a direction word may sit from the token it governs: "to the
// main tent" is two skips.
const DIRECTION_REACH = 3;

// Words that mean it is serious. The `score` lane's whole vocabulary: weights
// add, and the sum bends the distribution toward the top level.
const INTENSITY: Record<string, number> = {
  now: 1, asap: 2, urgent: 2, urgently: 2, immediately: 2, quickly: 1, hurry: 1,
  storm: 2, lightning: 2, flood: 2, flooding: 2, wind: 1, gale: 2,
  emergency: 3, evacuate: 3, evacuation: 3, fire: 3, critical: 3, danger: 3, dangerous: 3,
  injury: 2, injured: 2, medic: 2, collapse: 3, collapsed: 3, crush: 3, warning: 1,
};

const PREFIX_MIN = 3;
const CHOICE_GAIN = 3;
const NONE_PRIOR = 1;
const NOUL_GAIN = 2.6;
const SCORE_SPREAD = 0.55;

export type StateToken = { text: string; direction: string | undefined };

const wordsOf = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);

// Content tokens of a question's own wording. Pure digits are dropped: a level
// called "2" must not match the "2" in "20 minutes".
const contentTokensOf = (text: string): string[] => wordsOf(text).filter((word) => !STOPWORDS.has(word) && !DIRECTIONS.has(word) && !/^\d+$/.test(word));

const directionsOf = (text: string): ReadonlySet<string> => new Set(wordsOf(text).flatMap((word) => (DIRECTION_FAMILY[word] === undefined ? [] : [DIRECTION_FAMILY[word]])));

// Every string leaf of the state, in order. The wire allows a string, an object
// or an array; whatever the caller sent, the words are what is scored.
const NOTES: ReadonlySet<string> = new Set(['superseded']);

const stateText = (state: unknown): string => {
  if (typeof state === 'string') return state;
  if (Array.isArray(state)) return state.map(stateText).join(' ');
  // A NOTE ABOUT THE SENTENCE IS NOT THE SENTENCE. `superseded` is prose the
  // loop wrote for a model that reads; to a scorer that counts words it would be
  // the operator saying "taken", "back" and "place". (It also names the row that
  // was taken back — and this scorer must get no help with that: supersede.ts.)
  if (state !== null && typeof state === 'object') return Object.entries(state).filter(([key]) => !NOTES.has(key)).map(([, value]) => stateText(value)).join(' ');
  return '';
};

export const stateTokensOf = (state: unknown): StateToken[] => {
  const words = wordsOf(stateText(state));
  const tokens: StateToken[] = [];
  words.forEach((word, index) => {
    if (STOPWORDS.has(word) || DIRECTIONS.has(word) || /^\d+$/.test(word)) return;
    const before = words.slice(Math.max(0, index - DIRECTION_REACH), index).reverse();
    // The nearest direction word wins, and only across function words: in "to
    // the tent" `to` governs tent; in "to move tent" it governs `move`.
    const reach = before.findIndex((prior) => !STOPWORDS.has(prior) && !DIRECTIONS.has(prior));
    const governing = (reach < 0 ? before : before.slice(0, reach)).find((prior) => DIRECTIONS.has(prior));
    const own = governing === undefined ? undefined : DIRECTION_FAMILY[governing];
    tokens.push({ text: word, direction: own });
  });
  return tokens;
};

// 0–1: how much of `word` the typed `token` accounts for.
const matchStrength = (token: string, word: string): number => {
  if (token === word) return 1;
  if (token.length >= PREFIX_MIN && word.startsWith(token)) return 0.9 * (token.length / word.length);
  // The typed word runs PAST the option's: "headliners" for "headliner".
  if (word.length >= PREFIX_MIN + 1 && token.startsWith(word)) return 0.8;
  return 0;
};

const bestMatch = (token: string, words: readonly string[]): number => words.reduce((best, word) => Math.max(best, matchStrength(token, word)), 0);

const directionFactor = (token: StateToken, questionDirections: ReadonlySet<string>): number => {
  if (token.direction === undefined) return 1;
  if (questionDirections.has(token.direction)) return 1;
  return questionDirections.size === 0 ? 0.5 : 0.1;
};

const softmax = (logits: readonly number[]): number[] => {
  const peak = Math.max(...logits);
  const weights = logits.map((logit) => Math.exp(logit - peak));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
};

// ─── choice ──────────────────────────────────────────────────

export type ChoiceAnswer = { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number };

const scoreChoice = (tokens: readonly StateToken[], question: Extract<Question, { type: 'choice' }>): ChoiceAnswer => {
  const options = Object.entries(question.criteria);
  // Where the standing prior goes: `none` when it is offered, else the first
  // option — the asker's stated fallback.
  const fallback = options.some(([key]) => key === 'none') ? 'none' : (options[0]?.[0] ?? '');
  const directions = directionsOf(question.instructions);
  const optionWords = options.map(([key, meaning]) => contentTokensOf(`${key.replace(/_/g, ' ')} ${meaning}`));

  const evidence = options.map(() => 0);
  const strengthsOf = (token: StateToken): number[] => optionWords.map((words, index) => (options[index]?.[0] === 'none' ? 0 : bestMatch(token.text, words)));
  for (const token of tokens) {
    const strengths = strengthsOf(token);
    const matched = strengths.filter((strength) => strength > 0).length;
    if (matched === 0) continue;
    // Rarity: a token shared by every option separates none of them.
    strengths.forEach((strength, index) => {
      evidence[index] = (evidence[index] ?? 0) + (strength * directionFactor(token, directions)) / matched;
    });
  }

  const logits = options.map(([key], index) => (key === fallback ? NONE_PRIOR : 0) + (key === 'none' ? 0 : CHOICE_GAIN * (evidence[index] ?? 0)));
  const distribution = softmax(logits);
  const winner = distribution.reduce((best, value, index) => (value > (distribution[best] ?? 0) ? index : best), 0);
  return {
    type: 'choice',
    choice: options[winner]?.[0] ?? '',
    probabilities: Object.fromEntries(options.map(([key], index) => [key, distribution[index] ?? 0])),
    confidence: distribution[winner] ?? 0,
  };
};

// ─── noul ────────────────────────────────────────────────────

export type NoulAnswer = { type: 'noul'; noul: number };

// What a noul question is ABOUT: its `true` criterion when it has one (the
// instructions are then a template shared by every sibling question, and a
// word matching all of them separates nothing), otherwise its instructions.
const noulSubject = (question: Extract<Question, { type: 'noul' }>): string => question.criteria?.true ?? question.instructions;

const noulEvidence = (tokens: readonly StateToken[], subjectWords: readonly string[], rarity: ReadonlyMap<string, number>): number =>
  tokens.reduce((sum, token) => {
    const strength = bestMatch(token.text, subjectWords);
    return strength === 0 ? sum : sum + strength / Math.sqrt(rarity.get(token.text) ?? 1);
  }, 0);

// ─── score ───────────────────────────────────────────────────

export type ScoreAnswer = { type: 'score'; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number };

const scoreLevels = (tokens: readonly StateToken[], question: Extract<Question, { type: 'score' }>): ScoreAnswer => {
  const top = question.criteria.length - 1;
  // A level NAMED in the sentence wins outright; failing that, intensity words
  // bend the centre toward the top, saturating rather than overshooting.
  const named = question.criteria.map((label) => tokens.reduce((sum, token) => sum + bestMatch(token.text, contentTokensOf(label)), 0));
  const namedLevel = named.reduce((best, value, level) => (value > (named[best] ?? 0) ? level : best), 0);
  const intensity = tokens.reduce((sum, token) => sum + (INTENSITY[token.text] ?? 0), 0);
  const centre = (named[namedLevel] ?? 0) > 0 ? namedLevel : top * (1 - Math.exp(-0.5 * intensity));

  const distribution = softmax(question.criteria.map((_, level) => -((level - centre) ** 2) / (2 * SCORE_SPREAD ** 2)));
  return {
    type: 'score',
    score: Math.min(top, distribution.reduce((sum, value, level) => sum + value * level, 0)),
    legend: Object.fromEntries(question.criteria.map((label, level) => [String(level), label])),
    probabilities: Object.fromEntries(distribution.map((value, level) => [String(level), value])),
    confidence: Math.max(...distribution),
  };
};

// ─── the request ─────────────────────────────────────────────

export type Answer = ChoiceAnswer | NoulAnswer | ScoreAnswer;

// Questions compete with their own KIND: `action/…` against `action/…`.
const familyOf = (name: string): string => name.split('/')[0] ?? '';

export type ScorerOptions = {
  // Lift every yes/no onto [floor, 1]. 0 (the default) is the plain lexical
  // scorer; ~0.4 is a model with a middling opinion about everything.
  noulFloor?: number;
};

export const answerQuestions = (state: unknown, questions: Record<string, Question>, options: ScorerOptions = {}): Record<string, Answer> => {
  const floor = Math.min(0.95, Math.max(0, options.noulFloor ?? 0));
  const lifted = (p: number): number => floor + (1 - floor) * p;
  const tokens = stateTokensOf(state);

  // Rarity within a family of noul questions: how many of them a token matches
  // at all. One shared word must not light every card at once.
  const subjects = new Map<string, string[]>();
  for (const [name, question] of Object.entries(questions)) if (question.type === 'noul') subjects.set(name, contentTokensOf(noulSubject(question)));
  const rarities = new Map<string, Map<string, number>>();
  const rarityWithin = (family: string): Map<string, number> => {
    const known = rarities.get(family);
    if (known !== undefined) return known;
    const siblings = [...subjects.entries()].filter(([name]) => familyOf(name) === family).map(([, subject]) => subject);
    const rarity = new Map(tokens.map((token) => [token.text, Math.max(1, siblings.filter((subject) => bestMatch(token.text, subject) > 0).length)]));
    rarities.set(family, rarity);
    return rarity;
  };

  const answers: Record<string, Answer> = {};
  for (const [name, question] of Object.entries(questions)) {
    if (question.type === 'choice') answers[name] = scoreChoice(tokens, question);
    else if (question.type === 'score') answers[name] = scoreLevels(tokens, question);
    else answers[name] = { type: 'noul', noul: lifted(1 - Math.exp(-NOUL_GAIN * noulEvidence(tokens, subjects.get(name) ?? [], rarityWithin(familyOf(name))))) };
  }
  return answers;
};
