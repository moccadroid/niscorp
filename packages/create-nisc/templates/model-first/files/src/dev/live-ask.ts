import { existsSync } from 'node:fs';
import type { SignalClient } from '@niscorp/cortex';
import { AREAS } from '../app/shell/areas';
import type { Chat, Jev } from '../server/compose';
import { modelsFromEnv } from '../server/models';
import { startApp } from './scripted';

type Shown = { area: string; id: string; action: string; title: string; data: Record<string, unknown> };
type Screen = { canvases: Shown[]; arrangement: string; screen: string; said: string; response: string; title: string };
type Step = { ask: string; want?: (now: Screen, before: Screen) => string | undefined } | { open: string };

const at = (screen: Screen, area: string): Shown | undefined => screen.canvases.find((shown) => shown.area === area);
const is = (shown: Shown | undefined, action: string): boolean => shown?.action === action;
const has = (screen: Screen, action: string): boolean => screen.canvases.some((shown) => is(shown, action));

// Two areas showing the same card with the same content is never the screen a message wants.
const twice = (now: Screen): string | undefined => {
  const seen = now.canvases.filter((shown) => shown.action !== 'answer.text').map((shown) => JSON.stringify([shown.action, shown.data]));
  return new Set(seen).size === seen.length ? undefined : 'the same card is shown twice';
};

const shows = (action: string) => (now: Screen): string | undefined => (has(now, action) ? undefined : `want ${action}`);
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const tour = (screen: Screen): Shown | undefined => screen.canvases.find((shown) => is(shown, 'guide.checklist'));

const RUN: readonly Step[] = [
  { open: 'start' },
  { ask: 'What is an action?', want: shows('guide.actions') },
  { open: 'start' },
  { ask: 'Who may do what?', want: shows('guide.charter') },
  { open: 'start' },
  { ask: 'How does my message become a screen?', want: shows('guide.answers') },
  { open: 'start' },
  { ask: 'A counter that starts at 100', want: (now) => (now.canvases.some((shown) => is(shown, 'guide.counter') && shown.data['count'] === 100) ? undefined : 'want a counter at 100') },
  { open: 'start' },
  { ask: 'A checklist for my first nisc app', want: (now) => (now.canvases.some((shown) => is(shown, 'guide.checklist') && shown.title !== 'Your tour' && listOf(shown.data['todo']).length > 0) ? undefined : 'want a checklist of its own, with steps') },
  { open: 'start' },
  {
    ask: 'Quiz me on the charter',
    want: (now, before) => {
      const asked = new Set(before.canvases.filter((shown) => is(shown, 'guide.quiz')).map((shown) => String(shown.data['question'])));
      return now.canvases.some((shown) => is(shown, 'guide.quiz') && !asked.has(String(shown.data['question']))) ? undefined : 'want a new quick check';
    },
  },
  { open: 'start' },
  {
    ask: 'tick off the first step of my tour',
    want: (now, before) => (tour(now)?.id === tour(before)?.id && listOf(tour(now)?.data['done']).includes('Press the counter') ? undefined : 'want "Press the counter" ticked off, on the same checklist'),
  },
  { ask: 'add "Read the charter" to the tour', want: (now) => (listOf(tour(now)?.data['todo']).some((step) => /charter/i.test(String(step))) ? undefined : 'want the step added to the tour') },
  { open: 'start' },
  {
    ask: 'Put the charter beside the counter',
    want: (now, before) => {
      const counter = before.canvases.find((shown) => is(shown, 'guide.counter'));
      return counter !== undefined && at(now, counter.area)?.id === counter.id && has(now, 'guide.charter') ? undefined : 'want the counter where it was, and the charter';
    },
  },
  { open: 'start' },
  { ask: 'What can you do?', want: (now) => (has(now, 'answer.text') || has(now, 'guide.welcome') ? undefined : 'want words, or the welcome') },
  { open: 'asking' },
  { ask: 'Only the steps, please', want: (now) => (now.canvases.length === 1 && is(now.canvases[0], 'guide.answers') ? undefined : 'want the steps alone') },
  { open: 'start' },
  { ask: 'What are layouts?', want: shows('guide.layouts') },
  {
    ask: 'and the shell beside it',
    want: (now, before) => {
      const layouts = before.canvases.find((shown) => shown.action === 'guide.layouts');
      return layouts !== undefined && at(now, layouts.area)?.id === layouts.id && has(now, 'guide.shell') ? undefined : 'want the layouts card where it was, and the shell';
    },
  },
  {
    ask: 'now the charter instead of the shell',
    want: (now, before) => {
      const shell = before.canvases.find((shown) => shown.action === 'guide.shell');
      const layouts = before.canvases.find((shown) => shown.action === 'guide.layouts');
      const there = shell === undefined ? undefined : at(now, shell.area);
      return is(there, 'guide.charter') && (layouts === undefined || at(now, layouts.area)?.id === layouts.id) ? undefined : 'want the charter where the shell was, and the layouts card untouched';
    },
  },
  { ask: 'Show me the rules lesson', want: (now) => (now.screen === 'rules' ? undefined : 'want the rules screen') },
  { open: 'start' },
  { ask: 'How do I make this app mine?', want: shows('guide.yours') },
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
