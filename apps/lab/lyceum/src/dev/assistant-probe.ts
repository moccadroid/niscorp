import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { waitUntil, connect } from './harness';
import type { Terminal } from './harness';

if (existsSync('.env')) process.loadEnvFile('.env');
process.env['LYCEUM_ASSISTANT'] = 'live';
process.env['LYCEUM_QUERY'] = 'live';
process.env['LYCEUM_TIMER'] = 'live';
process.env['LYCEUM_MODERATION'] = 'fake';
const RUNS = Number(process.argv[2] ?? 2);

type Want = 'timer' | 'query' | 'open' | 'none';
type Who = 'waiting' | 'speaker';
const PROBES: readonly { who: Who; say: string; want: Want; containing?: string; saying?: string }[] = [
  { who: 'waiting', say: 'How many people are in the room?', want: 'query' },
  { who: 'waiting', say: 'End the talk in 30 minutes', want: 'none' },
  { who: 'waiting', say: 'Send the speaker a question: Will the slides be online?', want: 'open', containing: 'Will the slides be online?' },
  { who: 'speaker', say: 'Send the speaker a question: Will the slides be online?', want: 'none' },
  { who: 'speaker', say: 'End the talk in 30 minutes', want: 'timer', containing: 'slide.census' },
  { who: 'speaker', say: 'Who is in the room?', want: 'none' },
  { who: 'speaker', say: 'Remind me to drink water in 10 minutes', want: 'timer' },
  { who: 'speaker', say: 'What slide is on screen right now?', want: 'none', saying: 'nisc' },
];

const outcomeIn = (tree: string, overlay: string): Want =>
  overlay.includes('"value":"Query"') ? 'query' : tree.includes('Read it first') ? 'timer' : overlay.includes('"ref":"close"') ? 'open' : 'none';

const { boot } = await import('@lyceum/server/boot');
const main = async (): Promise<void> => {
  const booted = await boot();
  const httpServer = serve({ fetch: booted.server.fetch, port: 0 });
  attachSocket(httpServer, booted.server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const person = async (): Promise<Terminal> => {
    const door = await connect(base);
    await door.shows('main', '"ref":"pick"');
    door.click('main', 'pick');
    const token = await door.session();
    door.close();
    const phone = await connect(base, token);
    await phone.hello();
    await phone.shows('main', '"label":"Assistant"');
    await phone.shows('body', 'Can: ');
    return phone;
  };
  const people: Record<Who, { terminal: Terminal; canvas: string }> = {
    waiting: { terminal: await person(), canvas: 'body' },
    speaker: { terminal: await connect(base, await mintSession(booted.runtime.pool, 'speaker', 3_600_000)), canvas: 'tools' },
  };
  await people.speaker.terminal.hello();
  await people.speaker.terminal.shows('tools', 'Can: ');

  let passed = 0;
  let total = 0;
  for (let run = 0; run < RUNS; run += 1) {
    for (const probe of PROBES) {
      const { terminal, canvas } = people[probe.who];
      if (terminal.showsNow('overlay', '"ref":"close"')) {
        terminal.click('overlay', 'close');
        await waitUntil(() => !terminal.showsNow('overlay', '"ref":"close"'));
      }
      const started = Date.now();
      terminal.type(canvas, 'draft', probe.say);
      await new Promise((resolve) => setTimeout(resolve, 100));
      terminal.click(canvas, 'send');
      await waitUntil(() => terminal.showsNow(canvas, 'Thinking'));
      const settled = await (async () => {
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline && terminal.showsNow(canvas, 'Thinking')) await new Promise((resolve) => setTimeout(resolve, 200));
        return !terminal.showsNow(canvas, 'Thinking');
      })();
      const lastOf = (tree: string, who: 'You' | 'Assistant'): string => {
        const said = [...tree.matchAll(new RegExp(`"value":"${who}"\\}\\]\\},\\{"type":"component","name":"Text","props":\\{\\},"children":\\[\\{"type":"text","value":"([^"]{0,160})`, 'g'))];
        return said[said.length - 1]?.[1] ?? '';
      };
      await waitUntil(() => lastOf(terminal.textOf(canvas), 'You') === probe.say);
      const tree = terminal.textOf(canvas);
      const got = settled ? outcomeIn(tree, terminal.textOf('overlay')) : 'none';
      const reply = lastOf(tree, 'Assistant');
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
