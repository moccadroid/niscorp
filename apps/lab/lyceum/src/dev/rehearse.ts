// REHEARSAL — the room asking at once. N headless phones join through the
// door, are given the ask, and each asks one question inside a minute, the
// way a room does on the fingerprint slide. It reports how each was answered
// — replayed, generated, refused — and how long it took, so the limit the
// talk shares with every seam (MEASURED.md: 250k tokens a minute per model
// on this org) is measured before a date is set, not during the talk.
//
//   pnpm --filter lyceum rehearse          boots here, live: needs GROQ_API_KEY in .env
//   LYCEUM_PHONES=80                       how many phones (default 20)
//   LYCEUM_SPREAD_MS=60000                 the questions start spread over this long
//                                          (default a minute; 0 is everyone at once)
//   LYCEUM_REHEARSE_URL=wss://host         a room already running, instead of a boot —
//                                          the speaker must have given the ask there
//                                          first (the fingerprint slide's tool)
//   LYCEUM_QUERY=fake                      a dry run with no model, to check the script
//
// Not a check: it measures, and says what it measured.
import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { boot } from '@lyceum/server/boot';
import { connect, giveAsk } from './harness';
import type { Terminal } from './harness';

// Questions a room asks about itself. Phone i asks QUESTIONS[i % length], so
// a room larger than the list asks the same things in the same words and the
// router has replays to find.
const QUESTIONS = [
  'How many people are in the room?',
  'Who were the last three to join?',
  'Who has asked the most questions?',
  'How many questions have been asked?',
  'How many queries were replayed, generated and refused?',
  'Who arrived first?',
  'Everyone whose name is an otter',
  'How many queries has each person run?',
  'What has been asked so far?',
  'Who has not run a query yet?',
  "What's my name?",
  'How many people arrived after me?',
  'Which names start with a colour?',
  'How many people joined in the last ten minutes?',
  'Who asked the last question?',
  'How many of us are there, by the first letter of our names?',
];

const PHONES = Number(process.env['LYCEUM_PHONES'] ?? 20);
const SPREAD_MS = Number(process.env['LYCEUM_SPREAD_MS'] ?? 60_000);
const ASK_TIMEOUT_MS = 120_000;

type Outcome = 'replayed' | 'generated' | 'refused' | 'timeout';
type Result = { phone: number; intent: string; outcome: Outcome; ms: number; said: string };

const until = async (condition: () => boolean, ms: number): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return condition();
};

// The names the door offers: every `pick` on the screen carries one.
const offered = (terminal: Terminal): string[] => {
  const names: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    const props = record['props'];
    if (record['ref'] === 'pick' && typeof props === 'object' && props !== null && typeof (props as Record<string, unknown>)['value'] === 'string') names.push(String((props as Record<string, unknown>)['value']));
    walk(record['children']);
  };
  walk(JSON.parse(terminal.textOf('main') || '[]'));
  return names;
};

// One phone: in through the door under an offered name, back as themselves.
const join = async (base: string): Promise<Terminal> => {
  const door = await connect(base);
  await until(() => offered(door).length > 0, 10_000);
  const name = offered(door)[Math.floor(Math.random() * offered(door).length)] ?? '';
  door.click('main', 'pick', name);
  const token = await door.session();
  door.close();
  const phone = await connect(base, token);
  await phone.hello();
  return phone;
};

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

const main = async (): Promise<void> => {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const remote = process.env['LYCEUM_REHEARSE_URL'];
  let base = remote ?? '';
  let shutdown = async (): Promise<void> => {};

  if (remote === undefined) {
    const { server, runtime, close } = await boot();
    const httpServer = serve({ fetch: server.fetch, port: 0 });
    attachSocket(httpServer, server.socket);
    const address = httpServer.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    base = `ws://127.0.0.1:${address.port}`;
    await giveAsk(server, runtime.pool);
    shutdown = async () => {
      httpServer.close();
      await close();
    };
  }
  console.log(`rehearsing with ${PHONES} phones against ${remote ?? 'a local boot'} (${process.env['LYCEUM_QUERY'] === 'fake' || (process.env['GROQ_API_KEY'] ?? '') === '' ? 'no model: fake' : 'live'}), questions spread over ${SPREAD_MS} ms`);

  const phones = await Promise.all(Array.from({ length: PHONES }, () => join(base)));
  const ready = await Promise.all(phones.map((phone) => until(() => phone.showsNow('body', 'Ask the records'), 15_000)));
  if (!ready.every(Boolean)) {
    console.log(`${ready.filter((ok) => !ok).length} phones never got the ask — has the speaker given it (the fingerprint slide's tool)?`);
    phones.forEach((phone) => phone.close());
    await shutdown();
    process.exit(1);
  }

  const results = await Promise.all(
    phones.map(async (phone, index): Promise<Result> => {
      const intent = QUESTIONS[index % QUESTIONS.length] ?? QUESTIONS[0] ?? '';
      await new Promise((resolve) => setTimeout(resolve, Math.round((SPREAD_MS * index) / Math.max(1, PHONES - 1))));
      const started = Date.now();
      phone.type('body', 'intent', intent);
      await new Promise((resolve) => setTimeout(resolve, 100));
      phone.click('body', 'ask');
      const answered = await until(() => phone.showsNow('overlay', 'Replayed:') || phone.showsNow('overlay', 'a model wrote this one') || /do not reach|could not be written|No data answers/.test(phone.textOf('body')), ASK_TIMEOUT_MS);
      const ms = Date.now() - started;
      if (!answered) return { phone: index, intent, outcome: 'timeout', ms, said: '' };
      if (phone.showsNow('overlay', 'Replayed:')) return { phone: index, intent, outcome: 'replayed', ms, said: '' };
      if (phone.showsNow('overlay', 'a model wrote this one')) return { phone: index, intent, outcome: 'generated', ms, said: '' };
      const said = /(Your permissions do not reach that data\.|The query could not be written\.|No data answers that: [^"]*)/.exec(phone.textOf('body'))?.[1] ?? '';
      return { phone: index, intent, outcome: 'refused', ms, said };
    }),
  );

  for (const result of results) console.log(`${String(result.phone).padStart(3)}  ${result.outcome.padEnd(9)} ${String(result.ms).padStart(6)} ms  ${result.intent}${result.said === '' ? '' : `  — ${result.said}`}`);
  const by = (outcome: Outcome): Result[] => results.filter((result) => result.outcome === outcome);
  for (const outcome of ['replayed', 'generated', 'refused', 'timeout'] as const) {
    const these = by(outcome).map((result) => result.ms);
    if (these.length > 0) console.log(`${outcome.padEnd(9)} ${String(these.length).padStart(3)}   median ${percentile(these, 50)} ms   p95 ${percentile(these, 95)} ms   max ${Math.max(...these)} ms`);
  }
  console.log(`${results.length} phones asked in ${SPREAD_MS} ms; ${by('timeout').length} timed out after ${ASK_TIMEOUT_MS} ms`);

  phones.forEach((phone) => phone.close());
  await shutdown();
  process.exit(0);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
