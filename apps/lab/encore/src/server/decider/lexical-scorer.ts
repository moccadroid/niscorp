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
//   concepts  a few option KEYS are ordinary verbs of intent, and the words
//             that signal them are in nobody's criteria: "what should we do"
//             means `plan` without saying plan. A short cue lexicon keyed by
//             option key, exactly like the intensity words below.
//   asking    an option keyed `ask` is cued by the sentence's SHAPE — a
//             question mark, or an interrogative first word — and only when no
//             other concept cue fired: "what should we do?" is shaped like a
//             question and is a request for a plan. The generic reading is the
//             fallback, never the rival.
//   changed   "to the tent no the grove". A correction word — no, not,
//   mind      instead, rather, actually — splits the sentence: a match BEFORE
//             it is what the speaker took back, and counts for little once a
//             match AFTER it names another option of the same question. The
//             word after the correction also inherits the DIRECTION of the one
//             it replaces, because "no, the grove" is still "to the grove".
//   middling  a real decision model almost never says zero. With `noulFloor`
//             set, every yes/no answer is lifted onto [floor, 1], so an
//             unrelated card is a 0.4 guess instead of nothing — and a rule
//             that quietly relied on zeros fails HERE, in a check, instead of
//             in front of somebody on the calibrated model.
//   a bare    "storm at 9". A sentence made of nothing but intensity words and
//   problem   numbers names a danger and asks for nothing — which is a question
//             all the same ("and?"), so it cues `ask` exactly like a question
//             mark does, and under the same condition: no other cue fired.
//   finished  a noul that asks whether the sentence is FINISHED is answered
//             from the sentence's shape, not its vocabulary: enough words, not
//             ending on a function word, not ending on a stub of a longer word
//             the request itself contains — or it simply ends in a full stop,
//             a question mark or an exclamation mark, which is how people say
//             they have finished.
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
  'every', 'each', 'all', 'any', 'some', 'one', 'when', 'open', 'such', 'whether', 'will', 'them', 'their', 'they', 'who', 'what', 'which', 'how', 'not', 'none', 'these', 'about',
]);

// Direction words are neither content nor noise: they are read as a cue on the
// content token that follows them.
const DIRECTIONS: ReadonlySet<string> = new Set(['to', 'from', 'into', 'onto']);
const DIRECTION_FAMILY: Record<string, string> = { to: 'to', into: 'to', onto: 'to', from: 'from' };

// How far back a direction word may sit from the token it governs: "to the
// main tent" is two skips.
const DIRECTION_REACH = 3;

// Words that take back what was just said. Generic: they are about the
// SENTENCE, and the scorer still has no idea what was corrected.
const CORRECTIONS: ReadonlySet<string> = new Set(['no', 'not', 'instead', 'rather', 'actually', 'sorry', 'scratch']);
// What a match the speaker took back is still worth.
const TAKEN_BACK = 0.15;

// Words that mean it is serious. The `score` lane's whole vocabulary: weights
// add, and the sum bends the distribution toward the top level.
const INTENSITY: Record<string, number> = {
  now: 1, asap: 2, urgent: 2, urgently: 2, immediately: 2, quickly: 1, hurry: 1,
  storm: 2, lightning: 2, flood: 2, flooding: 2, wind: 1, gale: 2,
  emergency: 3, evacuate: 3, evacuation: 3, fire: 3, critical: 3, danger: 3, dangerous: 3,
  injury: 2, injured: 2, medic: 2, collapse: 3, collapsed: 3, crush: 3, warning: 1,
};

// Words that signal an intent whose option key they do not contain. Keyed by
// OPTION KEY, so they apply to any choice that offers that key and to nothing
// else — the scorer still has no idea what a festival is, only that "warn" is a
// way of asking for something to be written.
const CONCEPT_CUES: Record<string, ReadonlySet<string>> = {
  plan: new Set(['plan', 'should', 'options', 'option', 'strategy', 'advise', 'recommend', 'suggest']),
  write: new Set(['warn', 'tell', 'announce', 'message', 'draft', 'write', 'notify', 'inform', 'reword', 'rewrite']),
};

// The option key cued by shape rather than by vocabulary, and the first words
// that make a sentence a question without a question mark.
const ASK_KEY = 'ask';
const INTERROGATIVES: ReadonlySet<string> = new Set([
  'who', 'what', 'whats', 'which', 'where', 'when', 'why', 'how', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could', 'would', 'will', 'any', 'anything',
]);
// Terminal punctuation: a mark followed by a space or the end. Not "21.00".
const QUESTION_MARK = /\?(\s|$)/;
const TERMINAL_MARK = /[a-z0-9)][.?!](\s|$)/i;

const isQuestion = (raw: string, words: readonly string[]): boolean => QUESTION_MARK.test(raw) || INTERROGATIVES.has(words[0] ?? '');

// Nothing but the problem: every content token is an intensity word.
const isBareProblem = (tokens: readonly StateToken[]): boolean => tokens.length > 0 && tokens.every((token) => (INTENSITY[token.text] ?? 0) > 0);

const isAsked = (raw: string, words: readonly string[], tokens: readonly StateToken[]): boolean => isQuestion(raw, words) || isBareProblem(tokens);

// A noul whose own wording asks this is about the sentence's SHAPE.
const COMPLETENESS_WORDS: ReadonlySet<string> = new Set(['finished', 'unfinished', 'complete', 'incomplete']);
const FINISHED_MIN_TOKENS = 3;
const FINISHED_P = 0.92;
const UNFINISHED_P = 0.12;

const PREFIX_MIN = 3;
const CHOICE_GAIN = 3;
const NONE_PRIOR = 1;
const NOUL_GAIN = 2.6;
const SCORE_SPREAD = 0.55;

// `takenBack`: a correction word follows this token somewhere in the sentence.
export type StateToken = { text: string; direction: string | undefined; takenBack: boolean };

const wordsOf = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);

// Content tokens of a question's own wording. Pure digits are dropped: a level
// called "2" must not match the "2" in "20 minutes".
const contentTokensOf = (text: string): string[] => wordsOf(text).filter((word) => !STOPWORDS.has(word) && !DIRECTIONS.has(word) && !/^\d+$/.test(word));

const directionsOf = (text: string): ReadonlySet<string> => new Set(wordsOf(text).flatMap((word) => (DIRECTION_FAMILY[word] === undefined ? [] : [DIRECTION_FAMILY[word]])));

// Every string leaf of the state, in order. The wire allows a string, an object
// or an array; whatever the caller sent, the words are what is scored.
const stateText = (state: unknown): string => {
  if (typeof state === 'string') return state;
  if (Array.isArray(state)) return state.map(stateText).join(' ');
  if (state !== null && typeof state === 'object') return Object.values(state).map(stateText).join(' ');
  return '';
};

export const stateTokensOf = (state: unknown): StateToken[] => {
  const words = wordsOf(stateText(state));
  const tokens: StateToken[] = [];
  const lastCorrection = words.reduce((last, word, index) => (CORRECTIONS.has(word) ? index : last), -1);
  // The direction of the last thing said before the correction: what the word
  // after it inherits when it brings none of its own.
  let replaced: string | undefined;
  words.forEach((word, index) => {
    if (STOPWORDS.has(word) || DIRECTIONS.has(word) || CORRECTIONS.has(word) || /^\d+$/.test(word)) return;
    const before = words.slice(Math.max(0, index - DIRECTION_REACH), index).reverse();
    // The nearest direction word wins, and only across function words: in "to
    // the tent" `to` governs tent; in "to move tent" it governs `move`.
    const reach = before.findIndex((prior) => !STOPWORDS.has(prior) && !DIRECTIONS.has(prior));
    const governing = (reach < 0 ? before : before.slice(0, reach)).find((prior) => DIRECTIONS.has(prior));
    const own = governing === undefined ? undefined : DIRECTION_FAMILY[governing];
    const isAfter = lastCorrection >= 0 && index > lastCorrection;
    if (!isAfter && own !== undefined) replaced = own;
    tokens.push({ text: word, direction: own ?? (isAfter ? replaced : undefined), takenBack: lastCorrection >= 0 && index < lastCorrection });
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

const scoreChoice = (tokens: readonly StateToken[], words: readonly string[], raw: string, question: Extract<Question, { type: 'choice' }>): ChoiceAnswer => {
  const options = Object.entries(question.criteria);
  // Where the standing prior goes: `none` when it is offered, else the first
  // option — the asker's stated fallback.
  const fallback = options.some(([key]) => key === 'none') ? 'none' : (options[0]?.[0] ?? '');
  const directions = directionsOf(question.instructions);
  const optionWords = options.map(([key, meaning]) => contentTokensOf(`${key.replace(/_/g, ' ')} ${meaning}`));

  const evidence = options.map(() => 0);
  const strengthsOf = (token: StateToken): number[] => optionWords.map((words, index) => (options[index]?.[0] === 'none' ? 0 : bestMatch(token.text, words)));
  // Was something said AFTER the correction that names an option of THIS
  // question? Only then is what came before it taken back here: "not now, move
  // her to the tent" corrects nothing about which stage.
  const isCorrected = tokens.some((token) => !token.takenBack && tokens.some((other) => other.takenBack) && strengthsOf(token).some((strength) => strength > 0));
  for (const token of tokens) {
    const strengths = strengthsOf(token).map((strength) => (isCorrected && token.takenBack ? strength * TAKEN_BACK : strength));
    const matched = strengths.filter((strength) => strength > 0).length;
    if (matched === 0) continue;
    // Rarity: a token shared by every option separates none of them.
    strengths.forEach((strength, index) => {
      evidence[index] = (evidence[index] ?? 0) + (strength * directionFactor(token, directions)) / matched;
    });
  }

  let cued = 0;
  options.forEach(([key], index) => {
    const cues = CONCEPT_CUES[key];
    if (cues === undefined) return;
    const hits = words.filter((word) => cues.has(word)).length;
    cued += hits;
    evidence[index] = (evidence[index] ?? 0) + hits;
  });
  // The generic reading of a question-shaped sentence, when nothing more
  // specific claimed it.
  const askAt = options.findIndex(([key]) => key === ASK_KEY);
  if (askAt >= 0 && cued === 0 && isAsked(raw, words, tokens)) evidence[askAt] = (evidence[askAt] ?? 0) + 1;

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

const asksCompleteness = (question: Extract<Question, { type: 'noul' }>): boolean => wordsOf(question.instructions).some((word) => COMPLETENESS_WORDS.has(word));

const isNumber = (word: string): boolean => /^\d+$/.test(word);

// Is the sentence a finished thought? Judged on shape alone. `vocabulary` is
// every content word the REQUEST contains, which is what lets "headl" be
// recognised as a stub (it is most of a word the asker used) while "tent" and
// an unknown surname are taken as whole.
const looksFinished = (words: readonly string[], tokens: readonly StateToken[], vocabulary: ReadonlySet<string>, raw: string): boolean => {
  const last = words.at(-1);
  if (last === undefined) return false;
  if (TERMINAL_MARK.test(raw)) return true;
  if (tokens.length + words.filter(isNumber).length < FINISHED_MIN_TOKENS) return false;
  if (STOPWORDS.has(last) || DIRECTIONS.has(last)) return false;
  if (isNumber(last) || vocabulary.has(last) || last.length < PREFIX_MIN) return true;
  return ![...vocabulary].some((word) => word.length > last.length && word.startsWith(last));
};

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

// Every string a question carries, as one text.
const wordingOf = (question: Question): string => {
  if (question.type === 'choice') return [question.instructions, ...Object.entries(question.criteria).flat()].join(' ').replace(/_/g, ' ');
  if (question.type === 'score') return [question.instructions, ...question.criteria].join(' ');
  return [question.instructions, question.criteria?.true ?? '', question.criteria?.false ?? ''].join(' ');
};

export type ScorerOptions = {
  // Lift every yes/no onto [floor, 1]. 0 (the default) is the plain lexical
  // scorer; ~0.4 is a model with a middling opinion about everything.
  noulFloor?: number;
};

export const answerQuestions = (state: unknown, questions: Record<string, Question>, options: ScorerOptions = {}): Record<string, Answer> => {
  const floor = Math.min(0.95, Math.max(0, options.noulFloor ?? 0));
  const lifted = (p: number): number => floor + (1 - floor) * p;
  const tokens = stateTokensOf(state);
  const raw = stateText(state);
  const words = wordsOf(raw);

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

  // Every content word the request itself uses — what a stub is a stub OF.
  const vocabulary = new Set(Object.values(questions).flatMap((question) => contentTokensOf(wordingOf(question))));

  const answers: Record<string, Answer> = {};
  for (const [name, question] of Object.entries(questions)) {
    if (question.type === 'choice') answers[name] = scoreChoice(tokens, words, raw, question);
    else if (question.type === 'score') answers[name] = scoreLevels(tokens, question);
    else if (asksCompleteness(question)) answers[name] = { type: 'noul', noul: looksFinished(words, tokens, vocabulary, raw) ? FINISHED_P : UNFINISHED_P };
    else answers[name] = { type: 'noul', noul: lifted(1 - Math.exp(-NOUL_GAIN * noulEvidence(tokens, subjects.get(name) ?? [], rarityWithin(familyOf(name))))) };
  }
  return answers;
};
