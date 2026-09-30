import { existsSync, writeFileSync } from 'node:fs';
import { createMemoryCache, createPostgresAdapter, createQueryEngine } from '@niscorp/vex';
import type { ScopePolicy } from '@niscorp/vex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import { createSignal } from '@niscorp/signal';
import { devRuntime } from '@lyceum/server/runtime';
import { createQuerier } from '@lyceum/server/querying';
import { BEHAVIORS } from '@lyceum/app/vex/behaviors';
import { SLIDES } from '@lyceum/db/seed';
import { anchorTimer, createTimerWriter, proposable } from '@lyceum/server/timing';
import type { Written } from '@lyceum/server/timing';
import type { ReflexAnswer } from '@niscorp/tide/agent';
import type { Known } from '@lyceum/server/querying';
import { QUERY_SHAPES } from '@lyceum/app/vex/query.shapes';
import { ALL_NAMES } from '@lyceum/server/names';

// THE MODEL CHECK — do the talk's generative seams hold on the models the talk
// runs? Not part of `pnpm check`: it calls Groq, costs tokens and is measured,
// not asserted. `pnpm models [runs]` (default 3). Results: MEASURED.md.
//
// This first part measures vex's two reference agents — the query agent and
// the shape mapper (prism's mapping agent) — against lyceum's own schema and a
// seeded room, under a MEMBER's policy (members and queries readable,
// nothing else). Every question is asked with one of the app's own shapes
// (app/vex/query.shapes.ts). The default is the stage's setting, gpt-oss-120b
// at `low`; LYCEUM_MODEL / LYCEUM_EFFORT compare another.
//
// 2026-09-30, before any run on it: the room is rewritten. The talk has no
// departments and no ID cards any more — a member is the name they chose — so
// the seeded room is 40 chosen names and the queries they ran, and every probe
// that asked about departments or job titles is replaced by one about those.
// Numbers measured before this date are against the old room (MEASURED.md).

if (existsSync('.env')) process.loadEnvFile('.env');
if ((process.env['GROQ_API_KEY'] ?? '') === '') throw new Error('model-check: needs GROQ_API_KEY in apps/lab/lyceum/.env');

const RUNS = Number(process.argv[2] ?? 3);
const MODEL = process.env['LYCEUM_MODEL'] ?? 'openai/gpt-oss-120b';
const EFFORT = process.env['LYCEUM_EFFORT'] ?? 'low';

const SHAPES: Record<string, unknown> = Object.fromEntries(QUERY_SHAPES.map((entry) => [entry.kind, entry.shape]));
type ShapeName = string;

// The room: 40 people by chosen names, in the order they arrived, and the
// queries they ran — how each was answered cycling replayed, generated,
// refused. m0 arrived first and ran three; m4 ran none.
const ROOM = Array.from({ length: 40 }, (_, i) => ({ memberId: `m${i}`, name: ALL_NAMES[(i * 61) % ALL_NAMES.length] ?? 'Quiet Otter' }));
const nameOf = (memberId: string): string => ROOM.find((member) => member.memberId === memberId)?.name ?? '';
const RAN: readonly { memberId: string; request: string; shape: string }[] = [
  { memberId: 'm0', request: 'How many people are here?', shape: 'number' },
  { memberId: 'm0', request: 'Who arrived first?', shape: 'people' },
  { memberId: 'm0', request: 'Show me the login links', shape: 'list' },
  { memberId: 'm1', request: 'How many people are here?', shape: 'number' },
  { memberId: 'm2', request: 'Who arrived last?', shape: 'people' },
  { memberId: 'm3', request: 'How many queries were refused?', shape: 'number' },
  { memberId: 'm5', request: 'Who is here?', shape: 'people' },
];

// For a question about the querier, the right SHAPE is not enough: the answer
// must be theirs. The check asks as m0, the first of 40 to arrive.
const mentions = (text: string) => (result: unknown): boolean => JSON.stringify(result).includes(text);
// `as`: another querier than m0 — m4, who ran no queries.
const ALL_QUESTIONS: readonly { intent: string; shape: ShapeName; refuse?: true; answer?: (result: unknown) => boolean; as?: string }[] = [
  { intent: 'How many people are in the room?', shape: 'number' },
  { intent: 'How many queries were replayed, generated and refused?', shape: 'counts' },
  { intent: 'Who arrived first?', shape: 'people' },
  { intent: 'Who has run the most queries?', shape: 'people' },
  { intent: 'What has been asked so far?', shape: 'list' },
  { intent: 'Everyone whose name is an otter', shape: 'people' },
  { intent: 'Who has not run a query yet?', shape: 'people' },
  { intent: 'How many queries has each person run?', shape: 'counts' },
  { intent: 'Which questions were refused?', shape: 'list' },
  { intent: 'How many queries were refused?', shape: 'number' },
  { intent: "What's my name?", shape: 'people', answer: mentions(nameOf('m0')) },
  { intent: 'How many queries have I run?', shape: 'number', answer: mentions('3') },
  { intent: "What's my name?", shape: 'people', answer: mentions(nameOf('m4')), as: 'm4' },
  { intent: 'How many people arrived after me?', shape: 'number', answer: mentions('39') },
  { intent: 'Show me the login links', shape: 'list', refuse: true },
  { intent: 'Who can sign in as the speaker?', shape: 'list', refuse: true },
];
// LYCEUM_ONLY=<n>: just that question.
const only = process.env['LYCEUM_ONLY'];
const QUESTIONS = only === undefined ? ALL_QUESTIONS : ALL_QUESTIONS.filter((_, i) => String(i) === only);

// A member's reach: the room, and nothing of the machinery.
const MEMBER_POLICY: ScopePolicy = { default: 'deny', entities: { members: { read: [] }, queries: { read: [] } } };

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const HOW = ['replayed', 'generated', 'refused'];
const seedRoom = (): string =>
  [
    ...ROOM.map((member, i) => `INSERT INTO members (member_id, name, joined_at) VALUES (${quote(member.memberId)}, ${quote(member.name)}, now() - interval '${40 - i} minutes');`),
    ...RAN.map((query, i) => `INSERT INTO queries (member_id, request, shape, how, run_at) VALUES (${quote(query.memberId)}, ${quote(query.request)}, ${quote(query.shape)}, ${quote(HOW[i % HOW.length] ?? 'generated')}, now() - interval '${20 - i} minutes');`),
  ].join('\n');

// Does the answer have the shape that was asked for — array vs single, every
// key present with the kind of value the shape shows?
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const fitsItem = (item: unknown, example: Record<string, unknown>): boolean =>
  isRecord(item) && Object.entries(example).every(([key, sample]) => key in item && (item[key] === null || typeof item[key] === typeof sample));
const fits = (data: unknown, shape: ShapeName): boolean => {
  const example: unknown = SHAPES[shape];
  if (Array.isArray(example)) {
    const first: unknown = example[0];
    return Array.isArray(data) && isRecord(first) && data.every((item) => fitsItem(item, first));
  }
  return isRecord(example) && fitsItem(data, example);
};

// The mapper's tasks: rows as a query returns them, a shape they do not fit,
// and what a right answer must hold.
const at = (value: unknown, index: number): Record<string, unknown> => {
  const item: unknown = Array.isArray(value) ? value[index] : undefined;
  return isRecord(item) ? item : {};
};
const MAPPING_TASKS: readonly { name: string; rows: Record<string, unknown>[]; shape: unknown; expect: (result: unknown) => boolean }[] = [
  {
    name: 'rename columns into a list',
    rows: [{ request: 'Who is here?', how: 'replayed' }, { request: 'Show me the login links', how: 'refused' }],
    shape: [{ label: '', detail: '' }],
    expect: (result) => Array.isArray(result) && result.length === 2 && at(result, 0)['label'] === 'Who is here?' && at(result, 1)['detail'] === 'refused',
  },
  {
    name: 'join two columns into one',
    rows: [{ adjective: 'Quiet', animal: 'Otter' }],
    shape: [{ name: '' }],
    expect: (result) => at(result, 0)['name'] === 'Quiet Otter',
  },
  {
    name: 'a count into a single value',
    rows: [{ peopleCount: 40 }],
    shape: { value: 0 },
    expect: (result) => isRecord(result) && result['value'] === 40,
  },
  {
    name: 'a number into a string slot',
    rows: [{ how: 'replayed', queries: 8 }],
    shape: [{ label: '', value: '', detail: '' }],
    expect: (result) => at(result, 0)['label'] === 'replayed' && String(at(result, 0)['value']) === '8',
  },
  {
    name: 'group and count rows',
    rows: [{ how: 'refused' }, { how: 'refused' }, { how: 'replayed' }],
    shape: [{ group: '', count: 0 }],
    expect: (result) => Array.isArray(result) && result.some((item: unknown) => isRecord(item) && item['group'] === 'refused' && item['count'] === 2),
  },
  {
    name: 'a missing field defaults',
    rows: [{ name: 'Quiet Otter', joined_at: '2026-09-30T18:02:00Z' }],
    shape: [{ name: '', joined_at: '', queries: 0 }],
    expect: (result) => at(result, 0)['name'] === 'Quiet Otter' && 'queries' in at(result, 0),
  },
  {
    name: 'nest a flat row',
    rows: [{ request: 'Who is here?', member_name: 'Quiet Otter', member_joined: '18:02' }],
    shape: [{ request: '', member: { name: '', joined: '' } }],
    expect: (result) => {
      const member = at(result, 0)['member'];
      return isRecord(member) && member['name'] === 'Quiet Otter' && member['joined'] === '18:02';
    },
  },
  {
    name: 'a condition picks the words',
    rows: [{ request: 'Who is here?', fingerprint: null }, { request: 'How many are here?', fingerprint: 'fp_room' }],
    shape: [{ request: '', status: '' }],
    expect: (result) => Array.isArray(result) && result.length === 2 && at(result, 0)['status'] !== at(result, 1)['status'],
  },
];

type Outcome = { question: string; shape: ShapeName; ok: boolean; refused: boolean; ms: number; tokens: number; calls: number; note: string };

// What a generation COSTS: every model call's reported usage, read off the
// provider's own responses (the body is teed, never altered). One question
// runs at a time, so everything counted between its start and end is its.
const meter = { tokens: 0, calls: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const response = await realFetch(input, init);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('api.groq.com')) {
    meter.calls += 1;
    // LYCEUM_TRACE=1: what the agent was just told — the last message of each
    // request (a tool's answer, mostly), so a loop shows its reason.
    // LYCEUM_DUMP=<dir>: every request body, whole, one file per call.
    const dump = process.env['LYCEUM_DUMP'];
    if (dump !== undefined && typeof init?.body === 'string') writeFileSync(`${dump}/${String(meter.calls).padStart(3, '0')}.json`, init.body);
    if (process.env['LYCEUM_TRACE'] === '1' && typeof init?.body === 'string') {
      const sent: unknown = JSON.parse(init.body);
      const messages = typeof sent === 'object' && sent !== null && 'messages' in sent && Array.isArray(sent.messages) ? sent.messages : [];
      console.log(`  → ${JSON.stringify(messages.at(-2)).slice(0, 700)}
  ← ${JSON.stringify(messages.at(-1)).slice(0, 300)}`);
    }
    void response
      .clone()
      .text()
      .then((body) => {
        const totals = [...body.matchAll(/"total_tokens":\s*(\d+)/g)].map((match) => Number(match[1]));
        meter.tokens += totals.length === 0 ? 0 : Math.max(...totals);
      });
  }
  return response;
};

// LYCEUM_PART=route: the query router (server/querying.ts, live) — Jev with
// TYPESAFE_API_KEY. Given what has been asked before, does it send a question
// to the earlier question that asks for the same thing — and only then — and
// pick the right shape for a new one? Paraphrases must replay; the same words
// about a different subject must not.
// 2026-09-30, before any run on it: rewritten with the room — the probes
// about departments and job titles are replaced by ones about queries.
const KNOWN: readonly Known[] = [
  { request: 'How many people are in the room?', fingerprint: 'fp_room', shape: 'number' },
  { request: 'Who arrived first?', fingerprint: 'fp_first', shape: 'people' },
  { request: 'How many queries were refused?', fingerprint: 'fp_refused', shape: 'number' },
  { request: 'How many queries has each person run?', fingerprint: 'fp_per_person', shape: 'counts' },
  { request: 'What has been asked so far?', fingerprint: 'fp_asked', shape: 'list' },
  { request: 'Who has not run a query yet?', fingerprint: 'fp_quiet', shape: 'people' },
];
const ROUTES: readonly { question: string; replays?: string; shape?: string }[] = [
  { question: 'how many of us are here', replays: 'fp_room' },
  { question: 'What is the headcount right now?', replays: 'fp_room' },
  { question: 'Who was the first to arrive?', replays: 'fp_first' },
  { question: 'Number of refused queries', replays: 'fp_refused' },
  { question: 'Queries per person', replays: 'fp_per_person' },
  { question: 'Everything people have asked', replays: 'fp_asked' },
  { question: 'Who has not asked anything?', replays: 'fp_quiet' },
  { question: 'Which people have never run a query?', replays: 'fp_quiet' },
  // the same words about something else — must NOT replay
  { question: 'Who arrived last?', shape: 'people' },
  { question: 'How many queries were replayed?', shape: 'number' },
  { question: 'How many queries have I run?', shape: 'number' },
  { question: 'Who has run the most queries?', shape: 'people' },
  // new questions — the shape is the test
  { question: 'How many queries per shape?', shape: 'counts' },
  { question: 'List every refused request and why', shape: 'list' },
  { question: 'Whose name is an animal that swims?', shape: 'people' },
  { question: 'How long ago did the last person arrive?', shape: 'number' },
];

const measureRoutes = async (): Promise<void> => {
  const querier = createQuerier({ ...process.env, LYCEUM_QUERY: 'live' });
  const decider = (process.env['TYPESAFE_API_KEY'] ?? '') !== '' ? 'Jev (typesafe)' : `${MODEL}, emulating decide()`;
  let passed = 0;
  let total = 0;
  for (let run = 0; run < RUNS; run += 1) {
    for (const probe of ROUTES) {
      const started = Date.now();
      let got: string;
      try {
        const route = await querier.route(probe.question, KNOWN);
        got = 'replay' in route ? `replay ${route.replay.fingerprint}` : `new ${route.generate.kind}`;
      } catch (error) {
        got = `error ${error instanceof Error ? error.message.slice(0, 100) : String(error)}`;
      }
      const want = probe.replays !== undefined ? `replay ${probe.replays}` : `new ${probe.shape ?? ''}`;
      const ok = got === want;
      passed += ok ? 1 : 0;
      total += 1;
      console.log(`${ok ? '[pass]' : '[fail]'} ${String(Date.now() - started).padStart(5)}ms  ${probe.question} → ${got}${ok ? '' : `  (wanted ${want})`}`);
    }
  }
  console.log(`\nrouting on ${decider} · ${RUNS} run(s) · total ${passed}/${total}`);
};

// LYCEUM_PART=tide: the `automate` tool's writer (server/timing.ts, tide's
// reflex agent on gpt-oss-120b), from a fixed now — 19:05 in Vienna — handed
// the deck the way the controller's grounding hands it: ids, numbers, titles,
// and nothing about what any request means. PROBES WRITTEN BEFORE ANY RUN:
// slides named by their title, not their id; requests no offered effect can
// do, which must be REFUSED, not answered with an invented reflex.
//
// 2026-09-29, before the first run with timers: five timer probes added.
//
// 2026-09-29, before the first run with questions — the SPEC changed (the
// agent answers with a draft, a question, or a refusal; unclear requests are
// asked about, never guessed; `notify` replaced `timer.ring`), so four
// expectations changed with it, each marked, and three kinds of probe were
// added: requests that must NOT be asked about, once against every day, and
// a reply to a question coming back with the exchange. A draft is anchored at
// TIDE_NOW, as if saved the moment it was written, and judged by the instant
// it then fires at — a timer or a computed clock alike; a repeating clock by
// its period and time of day.
const TIDE_NOW = Date.UTC(2026, 8, 27, 17, 5);
const DECK_FACTS = `## The deck
${JSON.stringify(SLIDES.map((slide, index) => ({ slide_id: slide.slideId, number: index + 1, title: slide.title })))}`;
const DECK_SLIDE_IDS = SLIDES.map((slide) => slide.slideId);

type Wanted =
  | { draft: { at: string; effect: 'deck.show'; slideId: string } | { at: string; effect: 'notify' } | { every: 'day'; at: string; effect: 'notify' } }
  | { ask: true }
  | { refuse: true }
  | { either: readonly Wanted[] };
// `earlier`: the conversation before `intent` — each request and the writer's
// answer to it, as lyceum replays them (reflexConversation).
type TimerProbe = { intent: string; earlier?: { request: string; answer: ReflexAnswer }[]; wanted: Wanted };

const show = (at: string, slideId: string): Wanted => ({ draft: { at, effect: 'deck.show', slideId } });
const notifyAt = (at: string): Wanted => ({ draft: { at, effect: 'notify' } });
const ASK: Wanted = { ask: true };
const REFUSE: Wanted = { refuse: true };

const TIMER_PROBES: readonly TimerProbe[] = [
  // the first eight
  // SPEC CHANGE 2026-09-29 (was the closing slide), then again the same day:
  // a notification (the speaker, reminded) and the closing slide are both
  // right readings — the words do not say which. The slide by name is below.
  { intent: 'End the talk in 30 minutes', wanted: { either: [notifyAt('2026-09-27T19:35'), show('2026-09-27T19:35', 'slide.end')] } },
  { intent: 'Show the last slide in 30 minutes', wanted: show('2026-09-27T19:35', 'slide.end') }, // added 2026-09-29, before the run
  { intent: 'Put the register up at eight', wanted: ASK }, // SPEC CHANGE (was 20:00): morning or evening
  { intent: 'Go back to the title slide in 5 minutes', wanted: show('2026-09-27T19:10', 'slide.title') },
  // SPEC CHANGE 2026-09-30: the slide it named (slide.query) was cut; the same
  // request, about the slide that is there now.
  { intent: 'In 20 minutes, switch to the slide about asking in words', wanted: show('2026-09-27T19:25', 'slide.words') },
  { intent: 'At quarter to ten, wrap it up', wanted: ASK }, // SPEC CHANGE (was 21:45): morning or evening
  { intent: 'Email me in ten minutes', wanted: REFUSE },
  { intent: 'Remind me to drink water at nine', wanted: ASK }, // SPEC CHANGE (was a refusal): morning or evening
  { intent: 'End the talk', wanted: ASK }, // SPEC CHANGE (was a refusal): nothing says when
  // timers (added 2026-09-29, before their first run; `notify` replaced `timer.ring`)
  { intent: 'Set a timer for 3 minutes', wanted: notifyAt('2026-09-27T19:08:00') },
  { intent: 'A 90 second timer', wanted: notifyAt('2026-09-27T19:06:30') },
  { intent: 'Show the last slide in 2 minutes', wanted: show('2026-09-27T19:07:00', 'slide.end') },
  { intent: 'Ring in half an hour', wanted: notifyAt('2026-09-27T19:35:00') },
  { intent: 'In ten minutes, put the register up', wanted: show('2026-09-27T19:15:00', 'stage.register') },
  // must NOT be asked about: the words decide (added 2026-09-29, before the run)
  // SPEC CHANGE 2026-09-29, twice: asked about for a moment; then "nothing
  // repeats unless the person says so" — so the next 21:00, once.
  { intent: 'Put the register up at 21:00', wanted: show('2026-09-27T21:00', 'stage.register') },
  { intent: 'Tomorrow at nine in the morning, show the title slide', wanted: show('2026-09-28T09:00', 'slide.title') },
  // once against every day (added 2026-09-29, before the run)
  { intent: 'Today at 21:00, remind me to stretch', wanted: notifyAt('2026-09-27T21:00') },
  // SPEC CHANGE 2026-09-29: "9:00" is not plainly a 24-hour time — asking
  // "morning or evening?" is as right as writing 09:00.
  { intent: 'Every day at 9:00, remind me to drink water', wanted: { either: [{ draft: { every: 'day', at: '09:00', effect: 'notify' } }, ASK] } },
  // a reply to a question, with the conversation (added 2026-09-29, before the run)
  {
    intent: 'In the evening',
    earlier: [{ request: 'Put the register up at eight', answer: { question: 'At eight in the morning or eight in the evening?' } }],
    wanted: show('2026-09-27T20:00', 'stage.register'),
  },
  {
    intent: 'Tonight, just once',
    earlier: [{ request: 'Remind me to drink water at nine', answer: { question: 'Nine in the morning or nine in the evening — and just once, or every day?' } }],
    wanted: notifyAt('2026-09-27T21:00'),
  },
  // a correction of a draft not yet saved (added 2026-09-29, before its first run)
  {
    intent: 'Nah, I meant put up the last slide',
    earlier: [
      {
        request: 'End the talk in 30 minutes',
        answer: { id: 'end-talk-reminder', intent: 'Notify the speaker in 30 minutes that it is time to end the talk.', on: { timer: { minutes: 30 } }, effect: { name: 'notify', input: { text: 'Time to end the talk.' } } },
      },
    ],
    // SPEC CHANGE 2026-09-29, before its second measurement: "Nah" can reject the
    // whole draft, its 30 minutes too — asking when is as right as keeping them.
    wanted: { either: [show('2026-09-27T19:35', 'slide.end'), ASK] },
  },
];

// "YYYY-MM-DDTHH:MM" and "…:SS" name the same instant when the seconds are 00.
const toSecond = (at: string): string => (at.length === 16 ? `${at}:00` : at);

const describeWanted = (wanted: Wanted): string =>
  'either' in wanted
    ? wanted.either.map(describeWanted).join(' or ')
    : 'ask' in wanted
      ? 'a question'
      : 'refuse' in wanted
        ? 'a refusal'
        : `${'every' in wanted.draft ? `every ${wanted.draft.every} ` : ''}${wanted.draft.at} ${wanted.draft.effect}${'slideId' in wanted.draft ? ` ${wanted.draft.slideId}` : ''}`;

// What came back, in the terms a probe is judged in.
type Got = { kind: 'ask' | 'refuse'; text: string } | { kind: 'draft'; clock: { at: string; every?: string } | undefined; effect: string; slideId: string; text: string };

const gotOf = (written: Written): Got => {
  const { answer } = written;
  if ('question' in answer) return { kind: 'ask', text: `asked: ${answer.question.slice(0, 90)}` };
  if ('refused' in answer) return { kind: 'refuse', text: `refused: ${answer.refused.slice(0, 90)}` };
  const draft = proposable(answer, DECK_SLIDE_IDS);
  const kind = 'timer' in draft.on ? `timer ${JSON.stringify(draft.on.timer)}` : 'clock' in draft.on ? ('every' in draft.on.clock ? `every ${draft.on.clock.every}` : 'once') : 'other';
  const reflex = anchorTimer(draft, draft.id, TIDE_NOW, 'Europe/Vienna', DECK_SLIDE_IDS);
  const clock = 'clock' in reflex.on ? reflex.on.clock : undefined;
  const input: unknown = reflex.effect.input;
  const slideId = typeof input === 'object' && input !== null && 'slideId' in input ? String(input.slideId) : '';
  return { kind: 'draft', clock, effect: reflex.effect.name, slideId, text: `${clock?.at ?? '(not a clock)'} ${reflex.effect.name} ${slideId} [${kind}]` };
};

const matches = (wanted: Wanted, got: Got): boolean => {
  if ('either' in wanted) return wanted.either.some((one) => matches(one, got));
  if ('ask' in wanted) return got.kind === 'ask';
  if ('refuse' in wanted) return got.kind === 'refuse';
  if (got.kind !== 'draft' || got.clock === undefined) return false;
  const want = wanted.draft;
  const when = 'every' in want ? got.clock.every === want.every && got.clock.at === want.at : got.clock.every === undefined && toSecond(got.clock.at) === toSecond(want.at);
  return when && got.effect === want.effect && (!('slideId' in want) || got.slideId === want.slideId);
};

const judge = (probe: TimerProbe, written: Written): { ok: boolean; got: string } => {
  const got = gotOf(written);
  return { ok: matches(probe.wanted, got), got: got.text };
};

const measureTimers = async (): Promise<void> => {
  const writer = createTimerWriter({ ...process.env, LYCEUM_TIMER: 'live' });
  let passed = 0;
  let total = 0;
  for (let run = 0; run < RUNS; run += 1) {
    for (const probe of TIMER_PROBES) {
      const started = Date.now();
      const before = meter.tokens;
      let got: string;
      let ok = false;
      try {
        const written = await writer.write({ intent: probe.intent, now: TIDE_NOW, tz: 'Europe/Vienna', facts: DECK_FACTS, slideIds: DECK_SLIDE_IDS, earlier: (probe.earlier ?? []).map((turn) => ({ ...turn, reasoning: undefined })) });
        ({ ok, got } = judge(probe, written));
      } catch (error) {
        got = `error ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      passed += ok ? 1 : 0;
      total += 1;
      const label = probe.earlier === undefined ? probe.intent : `${probe.earlier.map((turn) => turn.request).join(' / ')} / ${probe.intent}`;
      console.log(`${ok ? '[pass]' : '[fail]'} ${String(Date.now() - started).padStart(5)}ms ${String(meter.tokens - before).padStart(6)} tok  ${label} → ${got}${ok ? '' : `  (wanted ${describeWanted(probe.wanted)})`}`);
    }
  }
  console.log(`
timers on ${MODEL} · reasoning ${EFFORT} · ${RUNS} run(s) · total ${passed}/${total}`);
};

const main = async (): Promise<void> => {
  if (process.env['LYCEUM_PART'] === 'tide') {
    await measureTimers();
    return;
  }
  if (process.env['LYCEUM_PART'] === 'route') {
    await measureRoutes();
    return;
  }
  const runtime = await devRuntime();
  await runtime.db.exec(seedRoom());

  const base = createSignal('groq', { options: { reasoningEffort: EFFORT === 'none' ? 'none' : EFFORT === 'low' ? 'low' : EFFORT === 'medium' ? 'medium' : 'default' } });
  const llm = base.model(MODEL);
  const adapter = createPostgresAdapter({ pool: runtime.pool });
  const dslJsonSchema = createQueryEngine({ adapter }).getDslSchema();

  // LYCEUM_PART=mapping: the shape mapper alone (prism's mapping agent) on
  // rows that do NOT already fit their shape, so every task calls the model.
  if (process.env['LYCEUM_PART'] === 'mapping') {
    const mapper = createShapeMapper(llm);
    const tally: { task: string; ok: boolean; tokens: number }[] = [];
    for (const task of Array.from({ length: RUNS }, () => MAPPING_TASKS).flat()) {
      const before = meter.tokens;
      let result: unknown;
      let note: string;
      try {
        result = (await mapper(task.rows, task.shape)).transformed;
        note = JSON.stringify(result).slice(0, 140);
      } catch (error) {
        note = error instanceof Error ? error.message.slice(0, 140) : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const ok = result !== undefined && task.expect(result);
      tally.push({ task: task.name, ok, tokens: meter.tokens - before });
      console.log(`${ok ? '[pass]' : '[fail]'} ${String(meter.tokens - before).padStart(6)} tok  ${task.name} → ${note}`);
    }
    console.log(`\n${MODEL} · reasoning ${EFFORT} · mapping · ${RUNS} run(s) per task`);
    for (const task of MAPPING_TASKS) {
      const mine = tally.filter((entry) => entry.task === task.name);
      const tokens = Math.round(mine.reduce((sum, entry) => sum + entry.tokens, 0) / Math.max(mine.length, 1));
      console.log(`${String(mine.filter((entry) => entry.ok).length).padStart(2)}/${mine.length}  ${String(tokens).padStart(6)} tok  ${task.name}`);
    }
    console.log(`\ntotal ${tally.filter((entry) => entry.ok).length}/${tally.length}`);
    await runtime.close();
    return;
  }

  const outcomes: Outcome[] = [];
  const ask = async (question: (typeof QUESTIONS)[number]): Promise<Outcome> => {
    // A fresh cache per question: every ask is a generation, never a replay.
    const engine = createQueryEngine({
      adapter,
      scope: MEMBER_POLICY,
      cache: createMemoryCache(),
      generateDsl: createQueryDsl({ llm, queryJsonSchema: dslJsonSchema }),
      mapToShape: createShapeMapper(llm),
      behaviors: BEHAVIORS,
    });
    await engine.introspect();
    const started = Date.now();
    const before = { ...meter };
    const cost = async (): Promise<{ tokens: number; calls: number }> => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { tokens: meter.tokens - before.tokens, calls: meter.calls - before.calls };
    };
    try {
      const response = await engine.execute({ intent: question.intent, shape: SHAPES[question.shape], context: {} }, { scope: { userId: question.as ?? 'm0' } });
      const ok = fits(response.result, question.shape) && (question.answer === undefined || question.answer(response.result));
      return { question: question.intent, shape: question.shape, ok: question.refuse === true ? false : ok, refused: false, ms: Date.now() - started, ...(await cost()), note: JSON.stringify(response.result).slice(0, 140) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { question: question.intent, shape: question.shape, ok: question.refuse === true, refused: true, ms: Date.now() - started, ...(await cost()), note: message.slice(0, 140) };
    }
  };

  // One at a time: the cost of each is then exact, and the rate limit (a
  // budget of tokens per minute per model, shared) is not what is measured.
  for (const job of Array.from({ length: RUNS }, () => QUESTIONS).flat()) {
    const outcome = await ask(job);
    outcomes.push(outcome);
    console.log(`${outcome.ok ? '[pass]' : '[fail]'} ${(outcome.ms / 1000).toFixed(1)}s ${String(outcome.tokens).padStart(6)} tok ${String(outcome.calls).padStart(2)} calls ${outcome.shape.padEnd(6)} ${outcome.question} → ${outcome.note}`);
    if (outcome.note.includes('429')) await new Promise((resolve) => setTimeout(resolve, 60_000));
  }

  console.log(`\n${MODEL} · reasoning ${EFFORT} · ${RUNS} run(s) per question`);
  for (const question of QUESTIONS) {
    const mine = outcomes.filter((outcome) => outcome.question === question.intent);
    const passed = mine.filter((outcome) => outcome.ok).length;
    const mean = mine.reduce((sum, outcome) => sum + outcome.ms, 0) / Math.max(mine.length, 1) / 1000;
    const tokens = Math.round(mine.reduce((sum, outcome) => sum + outcome.tokens, 0) / Math.max(mine.length, 1));
    console.log(`${String(passed).padStart(2)}/${mine.length}  ${mean.toFixed(1)}s  ${String(tokens).padStart(6)} tok  ${question.intent}`);
  }
  const passed = outcomes.filter((outcome) => outcome.ok).length;
  console.log(`\ntotal ${passed}/${outcomes.length}`);
  await runtime.close();
};

await main();
