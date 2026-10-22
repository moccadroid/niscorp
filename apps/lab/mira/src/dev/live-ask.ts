import { existsSync } from 'node:fs';
import type { SignalClient } from '@niscorp/cortex';
import { AREAS } from '../app/shell/areas';
import type { Chat, Jev } from '../server/compose';
import { modelsFromEnv } from '../server/models';
import { startApp } from './scripted';

type Shown = { area: string; id: string; action: string; title: string; data: Record<string, unknown> };
type Screen = { canvases: Shown[]; arrangement: string; screen: string; said: string; response: string; title: string };
type Step = { ask: string; want?: (now: Screen, before: Screen) => string | undefined } | { open: string };

const is = (shown: Shown | undefined, action: string): boolean => shown?.action === action;
const has = (screen: Screen, action: string): boolean => screen.canvases.some((shown) => is(shown, action));

// Two areas showing the same card with the same content is never the screen a message wants.
const twice = (now: Screen): string | undefined => {
  const seen = now.canvases.filter((shown) => shown.action !== 'answer.text').map((shown) => JSON.stringify([shown.action, shown.data]));
  return new Set(seen).size === seen.length ? undefined : 'the same card is shown twice';
};

const shows = (action: string) => (now: Screen): string | undefined => (has(now, action) ? undefined : `want ${action}`);

const RUN: readonly Step[] = [
  { open: 'start' },
  { ask: 'What is this app?', want: shows('answer.text') },
  { ask: 'Show me the start screen', want: (now) => (now.screen === 'start' ? undefined : 'want the start screen') },
];

const prompts = process.argv.includes('--prompts');
const why = prompts || process.argv.includes('--why');
const runs = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.slice('--runs='.length) ?? 1);
const noJev = process.argv.includes('--no-jev');
const own = process.argv.slice(2).filter((arg) => !arg.startsWith('--') || arg.startsWith('--screen='));
const steps: readonly Step[] = own.length > 0 ? own.map((arg): Step => (arg.startsWith('--screen=') ? { open: arg.slice('--screen='.length) } : { ask: arg })) : RUN;

if (existsSync('.env')) process.loadEnvFile('.env');
const models = modelsFromEnv(process.env);
const said: string[] = [];
const jevWith = noJev ? undefined : models.jev;
const jev: Jev | undefined = jevWith && {
  ...jevWith,
  decide: async (state, questions) => {
    const answered = await jevWith.decide(state, questions);
    const picked = answered.picked;
    if (prompts) said.push(`──── JEV STATE
${JSON.stringify(state, null, 2)}
──── JEV QUESTIONS
${JSON.stringify(questions, null, 2)}
──── JEV ANSWERED
${JSON.stringify(picked, null, 2)}`);
    const yes = Object.entries(picked).flatMap(([name, one]) => (one.yes ? [name] : []));
    said.push(`  Jev: ${yes.join(' ')}`);
    return answered;
  },
};
const told = (llm: SignalClient): SignalClient => ({
  ...llm,
  stepStream: (request, options) =>
    (async function* () {
      if (prompts) said.push(request.messages.map((message) => `──── ${message.role.toUpperCase()}\n${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`).join('\n'));
      for await (const event of llm.stepStream(request, options)) {
        if (event.type === 'done') said.push(`  model: ${event.result.content}`);
        yield event;
      }
    })(),
});
const chat: Chat | undefined = models.chat && { ...models.chat, llm: told(models.chat.llm) };

const times: number[] = [];
const scores: number[] = [];
const misses = new Map<string, number>();
for (let run = 1; run <= runs; run += 1) {
  const app = await startApp({ missing: models.missing, ...(jev !== undefined ? { jev } : {}), ...(chat !== undefined ? { chat } : {}) }, 60_000);
  const screenOf = (): Screen => ({
    canvases: AREAS.flatMap((area): Shown[] => {
      const { id, action, data } = app.on(area);
      return id === '' ? [] : [{ area, id, action, title: String(data['title'] ?? ''), data }];
    }),
    arrangement: app.current().arrangement ?? '',
    screen: app.current().screen ?? '',
    said: app.said(),
    response: app.current().response ?? '',
    title: app.current().label ?? '',
  });
  const print = (screen: Screen): string => screen.canvases.map((shown) => `  ${shown.area}: ${shown.action} — ${shown.title}`).join('\n');

  let right = 0;
  let scored = 0;
  console.log(`\n═══ run ${run}`);
  try {
    for (const step of steps) {
      if ('open' in step) {
        await app.openScreen(step.open);
        console.log(`» opened "${step.open}"`);
        continue;
      }
      const before = screenOf();
      const took = await app.ask(step.ask);
      if (took !== undefined) times.push(took);
      const screen = screenOf();
      const miss = took === undefined ? 'no answer in 60 s' : screen.said !== '' ? `the line says: ${screen.said}` : (twice(screen) ?? step.want?.(screen, before));
      if (step.want !== undefined) {
        scored += 1;
        if (miss === undefined) right += 1;
        else misses.set(step.ask, (misses.get(step.ask) ?? 0) + 1);
      }
      const verdict = step.want === undefined ? '' : miss === undefined ? ' ✓' : ` ✗ ${miss}`;
      console.log(`» "${step.ask}" — ${Math.round(took ?? 0)} ms ·${screen.arrangement}${verdict}${screen.said !== '' ? ` · the line says: ${screen.said}` : ''}\n  title: ${screen.title} · response: ${screen.response}\n${print(screen)}`);
      if (why) console.log(said.join('\n'));
      said.length = 0;
    }
  } finally {
    app.server.close();
  }
  if (scored > 0) {
    scores.push(right);
    console.log(`run ${run}: ${right}/${scored} right`);
  }
}

const sorted = [...times].sort((one, other) => one - other);
console.log(`\n${times.length} messages · median ${Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0)} ms · slowest ${Math.round(sorted[sorted.length - 1] ?? 0)} ms`);
if (scores.length > 0) {
  const scoredSteps = steps.filter((step) => 'ask' in step && step.want !== undefined).length;
  console.log(`right: ${scores.join(', ')} of ${scoredSteps} · ${scores.reduce((sum, score) => sum + score, 0)}/${scoredSteps * scores.length} in all`);
  for (const [ask, count] of misses) console.log(`  missed ${count}×: "${ask}"`);
}
process.exit(0);
