// ASSISTANT PROBE — the one assistant, LIVE (gpt-oss-120b routing; Jev and the
// query path for the records; tide's reflex agent for automations), through the real
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
process.env['LYCEUM_QUERY'] = 'live';
process.env['LYCEUM_TIMER'] = 'live';
process.env['LYCEUM_ISSUER'] = 'fake';
const RUNS = Number(process.argv[2] ?? 2);

type Want = 'timer' | 'query' | 'open' | 'none';
type Who = 'waiting' | 'speaker';
// `saying`: what the REPLY must say — for what only the screen can tell it.
const PROBES: readonly { who: Who; say: string; want: Want; containing?: string; saying?: string }[] = [
  { who: 'waiting', say: 'How many people are in the room?', want: 'query' },
  { who: 'waiting', say: 'End the talk in 30 minutes', want: 'none' },
  // RETIRED 2026-09-30 with the departments: Forms' rename (open) and "Which
  // department has the most people?" (query) — the actions and the table are
  // gone. Added the same day, before a run, in their place: the question form.
  { who: 'waiting', say: 'Send the speaker a question: Will the slides be online?', want: 'open', containing: 'Will the slides be online?' },
  // Added 2026-09-28, before the run: an action with nothing to pre-fill.
  { who: 'waiting', say: 'Show me my questions', want: 'open' },
  // RETIRED 2026-09-30: Records asking for the rename (none). In its place, the
  // same boundary: the speaker does not have the question form.
  { who: 'speaker', say: 'Send the speaker a question: Will the slides be online?', want: 'none' },
  // SPEC CHANGE 2026-09-30 (was slide.end): the deck ends on the census now.
  { who: 'speaker', say: 'End the talk in 30 minutes', want: 'timer', containing: 'slide.census' },
  { who: 'speaker', say: 'Who is in the room?', want: 'none' },
  // SPEC CHANGE 2026-09-29 (was none — no effect could remind): `notify` can.
  { who: 'speaker', say: 'Remind me to drink water in 10 minutes', want: 'timer' },
  // SPEC CHANGE 2026-09-30 (was 'The talk is an application'): the title slide is now 'nisc'.
  { who: 'speaker', say: 'What slide is on screen right now?', want: 'none', saying: 'nisc' },
];

// What the turn left, read off the trees the person sees: a query's result
// opened over the screen, or a proposal under the conversation.
const outcomeIn = (tree: string, overlay: string): Want =>
  overlay.includes('"value":"Vex query"') ? 'query' : tree.includes('Read it first') ? 'timer' : overlay.includes('"ref":"close"') ? 'open' : 'none';

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
    await door.shows('main', 'Step in');
    door.click('main', 'enter');
    const token = await door.session();
    door.close();
    const phone = await connect(base, token);
    await phone.hello();
    await phone.shows('main', '"label":"Assistant"');
    phone.click('main', 'tab', 'assistant.thread');
    await phone.shows('body', 'Built from');
    return phone;
  };
  const people: Record<Who, { terminal: Terminal; canvas: string }> = {
    waiting: { terminal: await person(), canvas: 'body' },
    speaker: { terminal: await connect(base, await mintSession(booted.runtime.pool, 'speaker', 3_600_000)), canvas: 'tools' },
  };
  await people.speaker.terminal.hello();
  await people.speaker.terminal.shows('tools', 'Built from');

  let passed = 0;
  let total = 0;
  for (let run = 0; run < RUNS; run += 1) {
    for (const probe of PROBES) {
      const { terminal, canvas } = people[probe.who];
      // Whatever the last turn opened over the screen is closed first, as a
      // person would before writing again.
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
      // The turn is a row the conversation reads reactively: wait until the
      // newest turn on screen is THIS one, then read its reply.
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
