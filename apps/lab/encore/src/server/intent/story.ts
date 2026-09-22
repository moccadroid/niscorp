import type { HeardTag } from './heard';
import type { HeldCard, PassRecord, RunRecord } from './intent.types';

// THE STORY OF ONE PASS — x-ray's main view, as DATA. Pure.
//
// The most interesting thing in this room is two models talking to each other,
// and the first x-ray buried it: five collapsed key/value grids, lowercase mono
// labels, and probability tags sprayed over every card. This is the same
// information as a short sequence a person can read top to bottom:
//
//   1. what was typed, and what was heard in it
//   2. Jev — what it wanted on screen and how much, which rows it picked, how
//      urgent it read
//   3. what the assistant was handed
//   4. the assistant — what it said, placed, looked up, and what the admission
//      rule dropped or refused, WITH THE REASON
//   5. what changed on screen
//
// An event pass tells the same story from the event. The layout draws these
// fields and knows nothing about either model (frame/intent-trace.layout.ts);
// the numbers — lanes, bytes, tokens — are a second tab, each label once.

export type StoryLine = { text: string; tone: 'plain' | 'mute' | 'warn' };
// `note`: why a card at or above the mount line is NOT on screen — beside its bar.
export type StoryCard = { id: string; label: string; p: number; shown: string; note: string };
export type StoryFact = { label: string; value: string };

export type Story = {
  key: string;
  // "Sentence 12" · "Event 4": what the stepper calls it.
  label: string;
  kind: 'sentence' | 'event';
  typed: string;
  heard: { label: string }[];
  corrections: StoryLine[];
  jevHeading: string;
  // Every card Jev was asked about, best first; `cardsTop` is the first few.
  cards: StoryCard[];
  cardsTop: StoryCard[];
  moreCards: number;
  decided: StoryLine[];
  handedHeading: string;
  handed: StoryFact[];
  assistantHeading: string;
  assistant: StoryLine[];
  screen: StoryLine[];
  timings: StoryFact[];
  cost: StoryFact[];
};

export const STORY_CARDS_SHOWN = 6;
export const STORIES_KEPT = 20;

const plain = (text: string): StoryLine => ({ text, tone: 'plain' });
const mute = (text: string): StoryLine => ({ text, tone: 'mute' });
const warn = (text: string): StoryLine => ({ text, tone: 'warn' });

const ms = (value: number): string => `${Math.round(value)} ms`;
const seconds = (value: number): string => `${(value / 1000).toFixed(1)} s`;
const list = (items: readonly string[]): string => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const nameOf = (label: string): string => label.split(' — ')[0] ?? label;

const cardsOf = (scored: readonly { id: string; p: number }[], titles: Record<string, string>, held: readonly HeldCard[] = []): StoryCard[] =>
  [...scored].sort((a, b) => b.p - a.p).map((entry) => ({ id: entry.id, label: titles[entry.id] ?? entry.id, p: entry.p, shown: entry.p.toFixed(2), note: held.find((card) => card.id === entry.id)?.reason ?? '' }));

const TONE_WORDS: Record<string, string> = { calm: 'calm — nothing urgent in it', elevated: 'elevated — something to watch', critical: 'critical — act now' };

// ─── 5. what changed on screen ───────────────────────────────

// The chrome's own keys are not news: every pass rewrites who placed a card and why.
const CHROME_KEYS = new Set(['placedBy', 'why', 'citeKey', 'tileSpan', 'tileHue', 'tileTag']);

const screenLineOf = (note: string, titles: Record<string, string>): StoryLine | undefined => {
  const titled = (id: string): string => titles[id] ?? id;
  const placed = /^\w+: placed (\S+)$/.exec(note);
  if (placed !== null) return plain(`Opened “${titled(placed[1] ?? '')}”.`);
  const closed = /^\w+: closed (\S+)$/.exec(note);
  if (closed !== null) return plain(`Closed “${titled(closed[1] ?? '')}”.`);
  const reopened = /^\w+: re-opened (\S+)$/.exec(note);
  if (reopened !== null) return plain(`Re-aimed “${titled(reopened[1] ?? '')}” — what it shows depends on a value that moved, so it was opened again.`);
  const set = /^\w+: set (.+) on (\S+)$/.exec(note);
  if (set !== null) {
    const keys = (set[1] ?? '').split(', ').filter((key) => !CHROME_KEYS.has(key));
    return keys.length === 0 ? undefined : plain(`Updated “${titled(set[2] ?? '')}” in place: ${list(keys)}.`);
  }
  if (note.startsWith('dropped:')) return warn('Nothing was changed: the line was cleared while this pass was out.');
  return undefined;
};

// A re-aim is reported as "re-opened" AND "placed"; one line says it.
const screenOf = (notes: readonly string[], titles: Record<string, string>): StoryLine[] => {
  const reopened = new Set(notes.flatMap((note) => /^\w+: re-opened (\S+)$/.exec(note)?.[1] ?? []));
  const lines = notes.filter((note) => !(/^\w+: placed (\S+)$/.test(note) && reopened.has(/^\w+: placed (\S+)$/.exec(note)?.[1] ?? ''))).flatMap((note) => screenLineOf(note, titles) ?? []);
  return lines.length === 0 ? [mute('Nothing moved: the room already showed this.')] : lines;
};

// ─── the numbers ─────────────────────────────────────────────

const timingsOf = (record: PassRecord, warm: string): StoryFact[] => [
  { label: 'Reading the sentence', value: ms(record.lanes.parse) },
  { label: 'Finding the rows it names', value: ms(record.lanes.candidates) },
  { label: 'Writing Jev’s questions', value: ms(record.lanes.derive) },
  { label: 'Jev round trip', value: ms(record.lanes.decide) },
  { label: 'Deciding the screen', value: ms(record.lanes.resolve) },
  { label: 'Rendering', value: ms(record.lanes.reconcile) },
  { label: 'Whole pass', value: ms(record.totalMs) },
  { label: 'Held back by the pacer first', value: ms(record.waitedMs) },
  { label: 'Connection to Jev', value: record.reusedConnection ? 'reused' : 'new' },
  ...(warm === '' ? [] : [{ label: 'Pre-warm', value: warm }]),
];

const costOf = (record: PassRecord, run: RunRecord | undefined): StoryFact[] => [
  { label: 'Jev', value: record.decider },
  { label: 'Questions asked', value: String(record.questionCount) },
  { label: 'Request size', value: `${record.requestBytes.toLocaleString('en-GB')} bytes` },
  { label: 'Probabilities', value: record.calibrated ? 'calibrated' : 'not calibrated — yes/no only' },
  ...(run === undefined
    ? []
    : [
        { label: 'Assistant', value: `${run.provider} · ${run.model}` },
        { label: 'Assistant run', value: `${seconds(run.ms)} · ${run.modelSteps} model step(s)` },
        { label: 'Tokens in / out', value: `${run.inputTokens.toLocaleString('en-GB')} / ${run.outputTokens.toLocaleString('en-GB')}${run.usageReported ? '' : ' (estimated)'}` },
        { label: 'Prompt size', value: `${run.promptChars.toLocaleString('en-GB')} characters, ${run.predecisionChars.toLocaleString('en-GB')} of them this turn` },
      ]),
];

// ─── 3 and 4. the assistant ──────────────────────────────────

export type StoryNames = { titles: Record<string, string>; packs: Record<string, string> };

const handedOf = (record: PassRecord, run: RunRecord, names: StoryNames): StoryFact[] => [
  { label: 'The few actions Jev ranked highest', value: list((run.narrowed.length > 0 ? run.narrowed : record.handoff.narrowed).map((id) => names.titles[id] ?? id)) || 'none' },
  { label: 'Read for it beforehand', value: list(run.packsSent.map((id) => names.packs[id] ?? id)) || 'nothing — the conversation alone' },
  { label: 'The conversation so far', value: `${run.threadMessages} message(s)` },
];

// An admission note, as a sentence somebody outside the codebase can read.
const droppedOf = (note: string): string =>
  note
    .replace(/^a citation was dropped: (.+) is not in the answer$/, 'Dropped one citation: the words it quoted ($1) are not in the answer.')
    .replace(/^a citation was dropped: "(.+)" is not on screen$/, 'Dropped one citation: it pointed at a card that is not on screen ($1).')
    .replace(/^a citation kept its card and lost its row: "(.+)" is not a row of (.+)$/, 'Kept one citation but not its row: it pointed at a row the card does not show ($1 on $2).')
    .replace(/^a follow-up was dropped: "(.+)" was already asked or offered in this thread$/, 'Dropped one follow-up: “$1” was already asked or offered in this conversation.')
    .replace(/^a follow-up was dropped: over (\d+) characters$/, 'Dropped one follow-up: longer than $1 characters.');

const assistantOf = (run: RunRecord, names: StoryNames): StoryLine[] => {
  const lines: StoryLine[] = [];
  for (const reason of run.refused) lines.push(warn(`Refused its first answer and asked again: ${reason}.`));
  if (run.status === 'running') lines.push(mute('Still working…'));
  if (run.status === 'aborted') lines.push(mute('Dropped: the line changed while it was out, and a run belongs to the text it started with.'));
  if (run.status === 'failed') lines.push(warn(`Failed, and nothing was changed: ${run.reason}`));
  if (run.status === 'landed') {
    lines.push(run.answer.trim() === '' ? mute('Said nothing: the cards already say it.') : plain(`Said: “${run.answer}”`));
    if (run.claims > 0) lines.push(plain(`${run.claims} of its statements cite a card on screen.`));
    for (const aimed of run.cardsAimed) lines.push(plain(`Aimed ${aimed}: aimed by the assistant from the facts it read.`));
    if (run.cardsMounted.length > 0) lines.push(plain(`Placed ${list(run.cardsMounted.map((id) => `“${names.titles[id] ?? id}”`))} as evidence.`));
    if (run.fieldsWritten.length > 0) lines.push(plain(`Wrote ${list(run.fieldsWritten)}.`));
    if (run.planSteps > 0) lines.push(plain(`Proposed ${run.planSteps} step(s); nothing opens until one is pressed.`));
    if (run.followUps.length > 0) lines.push(plain(`Suggested asking next: ${list(run.followUps.map((next) => `“${next}”`))}.`));
  }
  if (run.lookups.length > 0) lines.push(plain(`Looked up: ${run.lookups.join(' · ')}.`));
  for (const note of run.claimsDropped) lines.push(warn(droppedOf(note)));
  return lines;
};

// Why it ran — the only two reasons there are — and what it was handed.
const ranHeadingOf = (run: RunRecord): string => `Assistant ran (${run.startedBy === 'enter' ? 'Enter' : 'finished sentence'}) — what it was handed`;

export const assistantHeadingOf = (run: RunRecord): string => `Assistant · ${run.model} · ${seconds(run.ms)} · ${run.modelSteps} step${run.modelSteps === 1 ? '' : 's'}`;

// ─── a sentence ──────────────────────────────────────────────

export type SentenceStoryInput = {
  record: PassRecord;
  heard: readonly HeardTag[];
  scored: readonly { id: string; p: number }[];
  names: StoryNames;
  warm: string;
  run?: RunRecord;
};

export const sentenceStory = (input: SentenceStoryInput): Story => {
  const { record, names, run } = input;
  const cards = cardsOf(input.scored, names.titles, record.held);
  const picked = record.handoff.entities.map((entity) => `${nameOf(entity.label)} (${entity.table})`);
  return {
    key: `sentence-${record.pass}`,
    label: `Sentence, pass ${record.pass}`,
    kind: 'sentence',
    typed: `You typed: “${record.text}”`,
    heard: input.heard.map((tag) => ({ label: `${tag.label} · ${tag.state}` })),
    corrections: record.superseded.map((entry) => warn(`Took “${nameOf(entry.label)}” back (“${entry.marker}”): “${nameOf(entry.by.label)}” is meant instead — so Jev was never offered it.`)),
    jevHeading: `Jev · ${ms(record.lanes.decide)} · ${record.questionCount} questions`,
    cards,
    cardsTop: cards.slice(0, STORY_CARDS_SHOWN),
    moreCards: Math.max(0, cards.length - STORY_CARDS_SHOWN),
    decided: [
      plain(picked.length === 0 ? 'Picked no rows: the sentence names none it was sure of.' : `Picked ${list(picked)}.`),
      plain(`Read the mood as ${TONE_WORDS[record.tone] ?? record.tone}.`),
    ],
    handedHeading: run === undefined ? '' : ranHeadingOf(run),
    handed: run === undefined ? [] : handedOf(record, run, names),
    assistantHeading: run === undefined ? '' : assistantHeadingOf(run),
    assistant: run === undefined ? [] : assistantOf(run, names),
    screen: screenOf(record.notes, names.titles),
    timings: timingsOf(record, input.warm),
    cost: costOf(record, run),
  };
};

// The same story, with the run that answered it attached (or updated).
export const withRun = (story: Story, record: PassRecord, run: RunRecord, names: StoryNames): Story => ({
  ...story,
  handedHeading: ranHeadingOf(run),
  handed: handedOf(record, run, names),
  assistantHeading: assistantHeadingOf(run),
  assistant: assistantOf(run, names),
  cost: costOf(record, run),
});

// ─── an event ────────────────────────────────────────────────

export type EventStoryInput = {
  count: number;
  line: string;
  heard: readonly string[];
  decideMs: number;
  questionCount: number;
  scored: readonly { id: string; p: number }[];
  interrupt: number;
  interruptLine: number;
  urgency: string;
  outcome: string;
  names: StoryNames;
};

export const eventStory = (input: EventStoryInput): Story => {
  const cards = cardsOf(input.scored, input.names.titles);
  return {
    key: `event-${input.count}`,
    label: `Event ${input.count} — nobody typed`,
    kind: 'event',
    typed: `Something happened on site: ${input.line}`,
    heard: input.heard.map((label) => ({ label })),
    corrections: [],
    jevHeading: `Jev · ${ms(input.decideMs)} · ${input.questionCount} questions`,
    cards,
    cardsTop: cards.slice(0, STORY_CARDS_SHOWN),
    moreCards: Math.max(0, cards.length - STORY_CARDS_SHOWN),
    decided: [plain(`Worth interrupting somebody for? ${input.interrupt.toFixed(2)} — the line is ${input.interruptLine.toFixed(2)}.`), plain(`Read it as ${input.urgency}.`)],
    handedHeading: '',
    handed: [],
    assistantHeading: '',
    assistant: [],
    screen: [plain(input.outcome)],
    timings: [{ label: 'Jev round trip', value: ms(input.decideMs) }],
    cost: [{ label: 'Questions asked', value: String(input.questionCount) }],
  };
};
