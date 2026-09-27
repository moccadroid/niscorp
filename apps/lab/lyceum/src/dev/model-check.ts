import { existsSync, writeFileSync } from 'node:fs';
import { createMemoryCache, createPostgresAdapter, createQueryEngine } from '@niscorp/vex';
import type { ScopePolicy } from '@niscorp/vex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import { createSignal } from '@niscorp/signal';
import { devRuntime } from '@lyceum/server/runtime';
import { createQuerier } from '@lyceum/server/querying';
import { BEHAVIORS } from '@lyceum/app/vex/behaviors';
import { SLIDES } from '@lyceum/db/seed';
import { armable, createTimerWriter } from '@lyceum/server/timing';
import type { Known } from '@lyceum/server/querying';

// THE MODEL CHECK — do the talk's generative seams hold on the models the talk
// runs? Not part of `pnpm check`: it calls Groq, costs tokens and is measured,
// not asserted. `pnpm models [runs]` (default 3). Results: PLAN.md, "Measured".
//
// This first part measures vex's two reference agents — the query agent and
// the shape mapper (prism's mapping agent) — against lyceum's own schema and a
// seeded room, under a MEMBER's policy (members and departments readable,
// nothing else). Every question is asked with one of the authored shapes the
// ask will offer. The default is the stage's setting, gpt-oss-120b at `low`;
// LYCEUM_MODEL / LYCEUM_EFFORT compare another (qwen/qwen3.8-27b, `none`).

if (existsSync('.env')) process.loadEnvFile('.env');
if ((process.env['GROQ_API_KEY'] ?? '') === '') throw new Error('model-check: needs GROQ_API_KEY in apps/lab/lyceum/.env');

const RUNS = Number(process.argv[2] ?? 3);
const MODEL = process.env['LYCEUM_MODEL'] ?? 'openai/gpt-oss-120b';
const EFFORT = process.env['LYCEUM_EFFORT'] ?? 'low';

const SHAPES = {
  list: [{ label: '', value: '', detail: '' }],
  number: { value: 0 },
  counts: [{ group: '', count: 0 }],
  people: [{ name: '', title: '', department: '' }],
} as const;
type ShapeName = keyof typeof SHAPES;

// For a question about the querier, the right SHAPE is not enough: the answer
// must be theirs. The check asks as m0 — Ana Novak, Records, the first of 40.
const mentions = (text: string) => (result: unknown): boolean => JSON.stringify(result).includes(text);
// `as`: another querier than m0 — m4 is Eun-ji Silva, not yet in a department.
const ALL_QUESTIONS: readonly { intent: string; shape: ShapeName; refuse?: true; answer?: (result: unknown) => boolean; as?: string }[] = [
  { intent: 'How many people are in the room?', shape: 'number' },
  { intent: 'How many people are in each department?', shape: 'counts' },
  { intent: 'Who arrived first?', shape: 'people' },
  { intent: 'Who is in Records?', shape: 'people' },
  { intent: 'Which department is the biggest?', shape: 'list' },
  { intent: 'Everyone whose job title mentions a clerk', shape: 'people' },
  { intent: 'Who has not been assigned to a department yet?', shape: 'people' },
  { intent: 'What does each department let you do?', shape: 'list' },
  { intent: 'The personnel file lines of the people in Forms', shape: 'list' },
  { intent: 'How many people have not been assigned yet?', shape: 'number' },
  { intent: "What's my name?", shape: 'people', answer: mentions('Ana Novak') },
  { intent: 'Which department am I in?', shape: 'list', answer: mentions('Records') },
  { intent: "What's my name?", shape: 'people', answer: mentions('Eun-ji Silva'), as: 'm4' },
  { intent: 'How many people arrived after me?', shape: 'number', answer: mentions('39') },
  { intent: 'Show me the login links', shape: 'list', refuse: true },
  { intent: 'Who can sign in as the speaker?', shape: 'list', refuse: true },
];
// LYCEUM_ONLY=<n>: just that question.
const only = process.env['LYCEUM_ONLY'];
const QUESTIONS = only === undefined ? ALL_QUESTIONS : ALL_QUESTIONS.filter((_, i) => String(i) === only);

// A member's reach: the room, and nothing of the machinery.
const MEMBER_POLICY: ScopePolicy = { default: 'deny', entities: { members: { read: [] }, departments: { read: [] } } };

const FIRST = ['Ana', 'Ben', 'Chiara', 'Dev', 'Eun-ji', 'Farid', 'Greta', 'Hamid', 'Irene', 'Jakob', 'Kofi', 'Lena', 'Mateo', 'Nora', 'Omar', 'Priya', 'Quentin', 'Rosa', 'Sven', 'Tomoko'];
const LAST = ['Novak', 'Okafor', 'Lindqvist', 'Moreau', 'Silva', 'Kowalski', 'Tanaka', 'Haddad'];
const TITLES = ['Senior Clerk for Unclear Matters', 'Deputy Keeper of Pending Forms', 'Assistant Registrar of Queues', 'Officer of Provisional Approvals', 'Junior Auditor of Stamps', 'Head Clerk of Shared Drives'];
const QUIRKS = ['Has never once used the lift.', 'Keeps a spare stamp for emergencies.', 'Signs everything in pencil.', 'Reply-alls on principle.', 'Owns the only working stapler.'];
const DEPARTMENTS = ['records', 'forms', 'inquiries', 'archive', null];

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const seedRoom = (): string =>
  Array.from({ length: 40 }, (_, i) => {
    const department = DEPARTMENTS[i % DEPARTMENTS.length] ?? null;
    const name = `${FIRST[i % FIRST.length] ?? 'Ana'} ${LAST[(i * 7) % LAST.length] ?? 'Novak'}`;
    return `INSERT INTO members (member_id, name, title, quirk, department_id, joined_at, assigned_at) VALUES (${quote(`m${i}`)}, ${quote(name)}, ${quote(TITLES[i % TITLES.length] ?? '')}, ${quote(QUIRKS[i % QUIRKS.length] ?? '')}, ${department === null ? 'NULL' : quote(department)}, now() - interval '${40 - i} minutes', ${department === null ? 'NULL' : 'now()'});`;
  }).join('\n');

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
    rows: [{ name: 'Forms', remit: 'You can change your own record.' }, { name: 'Records', remit: 'You can read the register.' }],
    shape: [{ label: '', detail: '' }],
    expect: (result) => Array.isArray(result) && result.length === 2 && at(result, 0)['label'] === 'Forms' && at(result, 1)['detail'] === 'You can read the register.',
  },
  {
    name: 'join two columns into one',
    rows: [{ first: 'Ada', last: 'Lovelace' }],
    shape: [{ name: '' }],
    expect: (result) => at(result, 0)['name'] === 'Ada Lovelace',
  },
  {
    name: 'a count into a single value',
    rows: [{ peopleCount: 40 }],
    shape: { value: 0 },
    expect: (result) => isRecord(result) && result['value'] === 40,
  },
  {
    name: 'a number into a string slot',
    rows: [{ department: 'Forms', members: 8 }],
    shape: [{ label: '', value: '', detail: '' }],
    expect: (result) => at(result, 0)['label'] === 'Forms' && String(at(result, 0)['value']) === '8',
  },
  {
    name: 'group and count rows',
    rows: [{ department_id: 'forms' }, { department_id: 'forms' }, { department_id: 'records' }],
    shape: [{ group: '', count: 0 }],
    expect: (result) => Array.isArray(result) && result.some((item: unknown) => isRecord(item) && item['group'] === 'forms' && item['count'] === 2),
  },
  {
    name: 'a missing field defaults',
    rows: [{ name: 'Ana Novak', title: 'Senior Clerk' }],
    shape: [{ name: '', title: '', department: '' }],
    expect: (result) => at(result, 0)['name'] === 'Ana Novak' && 'department' in at(result, 0),
  },
  {
    name: 'nest a flat row',
    rows: [{ name: 'Ana', department_name: 'Forms', department_mark: 'dots' }],
    shape: [{ name: '', department: { name: '', mark: '' } }],
    expect: (result) => {
      const department = at(result, 0)['department'];
      return isRecord(department) && department['name'] === 'Forms' && department['mark'] === 'dots';
    },
  },
  {
    name: 'a condition picks the words',
    rows: [{ name: 'Ana', department_id: null }, { name: 'Ben', department_id: 'forms' }],
    shape: [{ name: '', status: '' }],
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
const KNOWN: readonly Known[] = [
  { request: 'How many people are in the room?', fingerprint: 'fp_room', shape: 'number' },
  { request: 'Who is in Records?', fingerprint: 'fp_records', shape: 'people' },
  { request: 'How many people are in each department?', fingerprint: 'fp_per_dept', shape: 'counts' },
  { request: 'Who arrived first?', fingerprint: 'fp_first', shape: 'people' },
  { request: 'What does each department let you do?', fingerprint: 'fp_remits', shape: 'list' },
  { request: 'How many people have not been assigned yet?', fingerprint: 'fp_waiting', shape: 'number' },
];
const ROUTES: readonly { question: string; replays?: string; shape?: string }[] = [
  { question: 'how many of us are here', replays: 'fp_room' },
  { question: 'What is the headcount right now?', replays: 'fp_room' },
  { question: 'who works in records', replays: 'fp_records' },
  { question: 'Members of the Records department', replays: 'fp_records' },
  { question: 'Department sizes', replays: 'fp_per_dept' },
  { question: "What is each department's clearance?", replays: 'fp_remits' },
  { question: 'Who was the first to arrive?', replays: 'fp_first' },
  { question: 'How many are still waiting for a department?', replays: 'fp_waiting' },
  // the same words about something else — must NOT replay
  { question: 'Who is in Forms?', shape: 'people' },
  { question: 'Who arrived last?', shape: 'people' },
  { question: 'How many people are in Archive?', shape: 'number' },
  { question: 'How many people have a title with Clerk in it?', shape: 'number' },
  // new questions — the shape is the test
  { question: 'How many people per job title?', shape: 'counts' },
  { question: 'List every department and its mark', shape: 'list' },
  { question: 'Who has the longest job title?', shape: 'people' },
  { question: 'How many departments are there?', shape: 'number' },
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
// do, and one that never says when — each must be REFUSED, not answered with an
// invented reflex; and the original "end the talk", with no hint left in the
// effect's description.
const TIDE_NOW = Date.UTC(2026, 8, 27, 17, 5);
const DECK_FACTS = `## The deck
${JSON.stringify(SLIDES.map((slide, index) => ({ slide_id: slide.slideId, number: index + 1, title: slide.title })))}`;
const DECK_SLIDE_IDS = SLIDES.map((slide) => slide.slideId);
const TIMER_PROBES: readonly { intent: string; at?: string; slideId?: string }[] = [
  { intent: 'End the talk in 30 minutes', at: '2026-09-27T19:35', slideId: 'slide.end' },
  { intent: 'Put the register up at eight', at: '2026-09-27T20:00', slideId: 'stage.register' },
  { intent: 'Go back to the title slide in 5 minutes', at: '2026-09-27T19:10', slideId: 'slide.title' },
  { intent: 'In 20 minutes, switch to the slide where the room asks questions', at: '2026-09-27T19:25', slideId: 'slide.query' },
  { intent: 'At quarter to ten, wrap it up', at: '2026-09-27T21:45', slideId: 'slide.end' },
  // must be refused
  { intent: 'Email me in ten minutes' },
  { intent: 'Remind me to drink water at nine' },
  { intent: 'End the talk' },
];

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
        const written = await writer.write({ intent: probe.intent, now: TIDE_NOW, tz: 'Europe/Vienna', facts: DECK_FACTS, slideIds: DECK_SLIDE_IDS });
        if ('refused' in written) {
          got = `refused: ${written.refused.slice(0, 90)}`;
          ok = probe.at === undefined;
        } else {
          const reflex = armable(written.reflex, DECK_SLIDE_IDS);
          const at = 'clock' in reflex.on ? reflex.on.clock.at : '(not a clock)';
          const input: unknown = reflex.effect.input;
          const slideId = typeof input === 'object' && input !== null && 'slideId' in input ? String(input.slideId) : '';
          got = `${at} ${slideId}`;
          ok = at === probe.at && slideId === probe.slideId;
        }
      } catch (error) {
        got = `error ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      passed += ok ? 1 : 0;
      total += 1;
      const wanted = probe.at === undefined ? 'a refusal' : `${probe.at} ${probe.slideId ?? ''}`;
      console.log(`${ok ? '[pass]' : '[fail]'} ${String(Date.now() - started).padStart(5)}ms ${String(meter.tokens - before).padStart(6)} tok  ${probe.intent} → ${got}${ok ? '' : `  (wanted ${wanted})`}`);
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
