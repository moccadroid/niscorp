// ASSISTANT PROBE — the one assistant, LIVE (gpt-oss-120b routing; Jev and the
// ask for questions; tide's reflex agent for automations), through the real
// boot and real websockets, as four different people. Measured, not asserted:
// it calls models, so it is not part of `pnpm check`. `pnpm probe:assistant [runs]`.
//
// Each probe says which proposal the person should end up with — or none, when
// what they asked is not theirs to have. WRITTEN BEFORE ANY RUN.
import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { waitUntil, connect } from './harness';
import type { Terminal } from './harness';

if (existsSync('.env')) process.loadEnvFile('.env');
process.env['LYCEUM_ASSISTANT'] = 'live';
process.env['LYCEUM_ASK'] = 'live';
process.env['LYCEUM_TIMER'] = 'live';
process.env['LYCEUM_ISSUER'] = 'fake';
const RUNS = Number(process.argv[2] ?? 2);

type Want = 'timer' | 'answer' | 'open' | 'none';
type Who = 'waiting' | 'forms' | 'records' | 'speaker';
// `saying`: what the REPLY must say — for what only the screen can tell it.
const PROBES: readonly { who: Who; say: string; want: Want; containing?: string; saying?: string }[] = [
  { who: 'waiting', say: 'How many people are in the room?', want: 'answer' },
  { who: 'waiting', say: 'End the talk in 30 minutes', want: 'none' },
  { who: 'forms', say: 'Change my name to Ada Lovelace', want: 'open', containing: 'Ada Lovelace' },
  { who: 'forms', say: 'Which department has the most people?', want: 'answer' },
  { who: 'records', say: 'Change my name to Ada Lovelace', want: 'none' },
  { who: 'speaker', say: 'End the talk in 30 minutes', want: 'timer', containing: 'slide.end' },
  { who: 'speaker', say: 'Who is in the room?', want: 'none' },
  { who: 'speaker', say: 'Remind me to drink water in 10 minutes', want: 'none' },
  { who: 'speaker', say: 'What slide is on screen right now?', want: 'none', saying: 'The talk is an application' },
];

// Which proposal the reply left, read off the tree the person sees.
// The history under the input is a Rows too, always there — an answer is a
// Figure, or a Rows other than the history (whose rows are keyed turn_id).
const proposalIn = (tree: string): Want => {
  const rows = tree.split('"name":"Rows"').length - 1;
  const history = tree.split('"rowKey":"turn_id"').length - 1;
  return tree.includes('Read it first') ? 'timer' : tree.includes('The answer') || rows > history ? 'answer' : tree.includes('"ref":"proposed"') ? 'open' : 'none';
};

const { boot } = await import('@lyceum/server/boot');
const main = async (): Promise<void> => {
  const booted = await boot();
  const httpServer = serve({ fetch: booted.server.fetch, port: 0 });
  attachSocket(httpServer, booted.server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const person = async (department: string | null): Promise<Terminal> => {
    const door = await connect(base);
    await door.shows('main', 'Step in');
    door.click('main', 'enter');
    const token = await door.session();
    const hello = await (await connect(base, token)).hello();
    door.close();
    if (department !== null) {
      await booted.runtime.db.query('UPDATE members SET department_id = $1 WHERE member_id = $2', [department, hello.principal]);
      booted.server.invalidateIdentity(hello.principal ?? '');
    }
    const phone = await connect(base, token);
    await phone.hello();
    await phone.shows('tabs', 'Assistant');
    phone.clickIn('tabs', 'open', 'Assistant');
    await phone.shows('body', 'Built from');
    return phone;
  };
  const people: Record<Who, { terminal: Terminal; canvas: string }> = {
    waiting: { terminal: await person(null), canvas: 'body' },
    forms: { terminal: await person('forms'), canvas: 'body' },
    records: { terminal: await person('records'), canvas: 'body' },
    speaker: { terminal: await connect(base, await mintSession(booted.runtime.pool, 'speaker', 3_600_000)), canvas: 'tools' },
  };
  await people.speaker.terminal.hello();
  await people.speaker.terminal.shows('tools', 'Built from');

  let passed = 0;
  let total = 0;
  for (let run = 0; run < RUNS; run += 1) {
    for (const probe of PROBES) {
      const { terminal, canvas } = people[probe.who];
      const started = Date.now();
      terminal.type(canvas, 'draft', probe.say);
      await new Promise((resolve) => setTimeout(resolve, 100));
      terminal.click(canvas, 'ask');
      await waitUntil(() => terminal.showsNow(canvas, 'Thinking'));
      const settled = await (async () => {
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline && terminal.showsNow(canvas, 'Thinking')) await new Promise((resolve) => setTimeout(resolve, 200));
        return !terminal.showsNow(canvas, 'Thinking');
      })();
      const tree = terminal.textOf(canvas);
      const got = settled ? proposalIn(tree) : 'none';
      const reply = /"value":"([^"]{0,160})/.exec(tree.slice(tree.indexOf('"Text"', tree.indexOf('Ask →'))))?.[1] ?? '';
      const ok = settled && got === probe.want && (probe.containing === undefined || tree.includes(probe.containing)) && (probe.saying === undefined || reply.toLowerCase().includes(probe.saying.toLowerCase()));
      passed += ok ? 1 : 0;
      total += 1;
      console.log(`${ok ? '[pass]' : '[fail]'} ${String(Date.now() - started).padStart(6)}ms  ${probe.who.padEnd(8)} ${probe.say} → ${got}${ok ? '' : ` (wanted ${probe.want})`} · "${reply}"`);
    }
  }
  console.log(`\nassistant, live · ${RUNS} run(s) · total ${passed}/${total}`);
  for (const { terminal } of Object.values(people)) terminal.close();
  httpServer.close();
  await booted.close();
};

await main();
