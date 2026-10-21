import { existsSync } from 'node:fs';
import { AREAS } from '../app/shell/areas';
import { boot } from '../server/boot';
import type { SignalClient } from '@niscorp/cortex';
import type { Chat, Jev } from '../server/compose';
import { modelsFromEnv } from '../server/models';

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const recordOf = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

// Asks the real models, with the keys in .env, the cases asked of mira — each from the screen it was asked on — and
// prints each screen, how long it took, and whether it is the screen the message wants: what it asked for, and every
// area it did not ask about holding the same canvas, in the same arrangement. It costs a Jev pass and a chat call a
// message.
//   --runs=<n>  the cases, n times over, with the count of right screens at the end
//   --why       each message also prints what Jev said yes to and what the model replied
//   --prompts   each message also prints everything Jev and the model were sent, and what each answered
//   --no-jev    the chat model alone, with no Jev pass
//   messages    messages of your own instead, unscored; --screen=<id> opens that screen from the menu

type Shown = { area: string; id: string; action: string; read: string; params: Record<string, unknown>; fields: string[]; title: string };
type Screen = { canvases: Shown[]; arrangement: string; screen: string; said: string; response: string; title: string };
type Step = { ask: string; want?: (now: Screen, before: Screen) => string | undefined } | { open: string };

const at = (screen: Screen, area: string): Shown | undefined => screen.canvases.find((shown) => shown.area === area);
const is = (shown: Shown | undefined, action: string): boolean => shown?.action === action;
const has = (screen: Screen, action: string): boolean => screen.canvases.some((shown) => is(shown, action));

// Two areas showing the same thing is never the screen a message wants.
const twice = (now: Screen): string | undefined => {
  const seen = now.canvases.filter((shown) => shown.action !== 'answer.text').map((shown) => shown.action);
  return new Set(seen).size === seen.length ? undefined : 'the same card is shown twice';
};

const shows = (action: string) => (now: Screen): string | undefined => (has(now, action) ? undefined : `want ${action}`);

const RUN: readonly Step[] = [
  { open: 'start' },
  { ask: 'What is an action?', want: shows('guide.actions') },
  { open: 'start' },
  { ask: 'Who may do what?', want: shows('guide.charter') },
  { open: 'start' },
  { ask: 'How does my message become a screen?', want: shows('guide.answers') },
  { open: 'start' },
  { ask: 'What is an action?' },
  { ask: 'How is an action drawn?', want: shows('guide.layouts') },
  { ask: 'show start + intro', want: (now) => (now.screen === 'start' ? undefined : 'want the start screen') },
  { open: 'start' },
  { ask: 'What can you do?', want: (now) => (has(now, 'answer.text') ? undefined : 'want words') },
  { open: 'start' },
  { ask: 'the nisc card big at the top, the actions and the yours card below it', want: (now) => (is(now.canvases[0], 'guide.nisc') && has(now, 'guide.actions') && has(now, 'guide.yours') ? undefined : 'want the nisc card first, the actions and the yours card beneath') },
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
// Every step the composer's run takes: what it was sent, and what the model wrote.
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

const until = async (condition: () => boolean, ms = 60_000): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) return false;
    await new Promise((done) => setTimeout(done, 5));
  }
  return true;
};

const times: number[] = [];
const scores: number[] = [];
const misses = new Map<string, number>();
for (let run = 1; run <= runs; run += 1) {
  const { server } = await boot({ models: { missing: models.missing, ...(jev !== undefined ? { jev } : {}), ...(chat !== undefined ? { chat } : {}) }, runs: () => {} });
  const shells = server.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');
  const session = await shells.session(null, null);
  const shell = session.shell;
  // Each message is answered when the line's `ask` call ends, whatever screen it leaves.
  let answers = 0;
  shell.onEndpoint((event) => {
    if (event.canvasId === 'dock' && event.name === 'ask') answers += 1;
  });
  const dataOf = (canvas: string): Record<string, unknown> => {
    const active = shell.getState().canvases[canvas]?.active;
    return active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {});
  };
  const current = (): Record<string, unknown> => recordOf(dataOf('dock')['current']);
  const screenOf = (): Screen => ({
    canvases: AREAS.flatMap((area): Shown[] => {
      const active = shell.getState().canvases[area]?.active;
      if (active === undefined) return [];
      const data = dataOf(area);
      const fields = Array.isArray(data['fields']) ? data['fields'].map((field: unknown) => String(recordOf(field)['value'] ?? '')) : [];
      return [{ area, id: active.id, action: active.definitionId, read: String(data['read'] ?? ''), params: recordOf(data['params']), fields, title: String(data['title'] ?? '') }];
    }),
    arrangement: String(current()['arrangement'] ?? ''),
    screen: String(current()['screen'] ?? ''),
    said: String(dataOf('dock')['error'] ?? ''),
    response: String(current()['response'] ?? ''),
    title: String(current()['label'] ?? ''),
  });
  const print = (screen: Screen): string => screen.canvases.map((shown) => `  ${shown.area}: ${shown.action} — ${[shown.title, shown.read, JSON.stringify(shown.params) !== '{}' ? JSON.stringify(shown.params) : '', shown.fields.length > 0 ? JSON.stringify(shown.fields) : ''].filter((part) => part !== '').join(' · ')}`).join('\n');

  let right = 0;
  let scored = 0;
  console.log(`\n═══ run ${run}`);
  try {
    for (const step of steps) {
      if ('open' in step) {
        session.dispatch('dock', { type: 'ui:click', ref: 'screen', payload: step.open });
        await until(() => current()['screen'] === step.open);
        await new Promise((done) => setTimeout(done, 200));
        console.log(`» opened "${step.open}"`);
        continue;
      }
      shell.flattenRenderTree(shell.getShellRenderTree());
      const before = screenOf();
      const seen = answers;
      const started = performance.now();
      session.dispatch('dock', { type: 'ui:model', ref: 'text', payload: step.ask });
      session.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
      const answered = await until(() => answers > seen);
      const took = performance.now() - started;
      times.push(took);
      await new Promise((done) => setTimeout(done, 300));
      const screen = screenOf();
      const miss = !answered ? 'no answer in 60 s' : screen.said !== '' ? `the line says: ${screen.said}` : (twice(screen) ?? step.want?.(screen, before));
      if (step.want !== undefined) {
        scored += 1;
        if (miss === undefined) right += 1;
        else misses.set(step.ask, (misses.get(step.ask) ?? 0) + 1);
      }
      const verdict = step.want === undefined ? '' : miss === undefined ? ' ✓' : ` ✗ ${miss}`;
      console.log(`» "${step.ask}" — ${Math.round(took)} ms · ${screen.arrangement}${verdict}${screen.said !== '' ? ` · the line says: ${screen.said}` : ''}\n  title: ${screen.title} · response: ${screen.response}\n${print(screen)}`);
      if (why) console.log(said.join('\n'));
      said.length = 0;
    }
  } finally {
    server.close();
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
