import { existsSync } from 'node:fs';
import { AREAS } from '../app/shell/areas';
import { boot } from '../server/boot';
import type { Decide, Fill } from '../server/compose';
import { modelsFromEnv } from '../server/models';

// Asks the real models, with the keys in .env, a run of messages in one session — each after the one before, so a
// message is about the screen the last one left — and prints each screen, how long it took, and whether it is the
// screen the message wants. It costs a Jev pass and a chat call a message.
//   --runs=<n>  the run, n times over, with the count of right screens at the end
//   --why       each message also prints what Jev said yes to and what the model replied
//   --no-jev    the chat model alone, with no Jev pass
//   messages    a run of your own instead, unscored; --screen=<id> opens that screen from the menu

type Shown = { action: string; read: string; params: Record<string, unknown>; fields: string[]; title: string };
type Screen = { canvases: Shown[]; arrangement: string; screen: string };
type Step = { ask: string; want?: (screen: Screen) => string | undefined } | { open: string };

const is = (shown: Shown | undefined, action: string, read?: string): boolean => shown?.action === action && (read === undefined || shown.read === read);
const only = (screen: Screen, ...wanted: [string, string?][]): string | undefined =>
  screen.canvases.length === wanted.length && wanted.every(([action, read], at) => is(screen.canvases[at], action, read)) ? undefined : `want ${wanted.map(([action, read]) => `${action}${read !== undefined ? `(${read})` : ''}`).join(', ')}`;
const has = (screen: Screen, action: string, read?: string): boolean => screen.canvases.some((shown) => is(shown, action, read));
const lower = (value: unknown): string => String(value ?? '').toLowerCase();

const RUN: readonly Step[] = [
  { ask: 'Show me every greeting', want: (screen) => only(screen, ['rows.table', 'greetings/list']) },
  { ask: 'How many greetings are there?', want: (screen) => (has(screen, 'rows.stat', 'greetings/count') ? undefined : 'want the count') },
  { ask: 'Which greetings are in German?', want: (screen) => (screen.canvases.some((shown) => is(shown, 'rows.table', 'greetings/in-language') && shown.params['language'] === 'German') && !has(screen, 'rows.table', 'greetings/list') ? undefined : 'want the German greetings alone') },
  { ask: 'and the count beside it', want: (screen) => only(screen, ['rows.table', 'greetings/in-language'], ['rows.stat', 'greetings/count']) },
  { ask: 'only the Italian ones', want: (screen) => (screen.canvases.some((shown) => is(shown, 'rows.table', 'greetings/in-language') && shown.params['language'] === 'Italian') && !screen.canvases.some((shown) => shown.params['language'] === 'German') ? undefined : 'want the Italian greetings in place of the German') },
  { open: 'greetings' },
  {
    ask: 'bon jour is french',
    want: (screen) => {
      const form = screen.canvases.find((shown) => shown.action === 'rows.form');
      return only(screen, ['rows.table', 'greetings/list'], ['rows.form']) ?? (lower(form?.fields[0]) === 'bon jour' && lower(form?.fields[1]) === 'french' ? undefined : `want the form filled: ${JSON.stringify(form?.fields)}`);
    },
  },
  { ask: 'drop the form', want: (screen) => only(screen, ['rows.table', 'greetings/list']) },
  { ask: 'and the per-language bars next to it', want: (screen) => only(screen, ['rows.table', 'greetings/list'], ['rows.bars', 'greetings/per-language']) },
  { ask: 'the count big at the top, the bars and the table below it', want: (screen) => (is(screen.canvases[0], 'rows.stat', 'greetings/count') && has(screen, 'rows.bars') && has(screen, 'rows.table') && screen.canvases.length === 3 ? undefined : 'want the count first, then the bars and the table') },
  { ask: 'show overview + app overview', want: (screen) => (screen.screen === 'overview' ? undefined : 'want the overview') },
  { ask: 'What can you do?', want: (screen) => (is(screen.canvases[0], 'answer.text') ? undefined : 'want words first') },
  { ask: 'Add a greeting that says Servus', want: (screen) => (screen.canvases.some((shown) => shown.action === 'rows.form' && lower(shown.fields[0]) === 'servus') ? undefined : 'want the form with Servus') },
  { ask: "add hej, it's swedish", want: (screen) => (screen.canvases.some((shown) => shown.action === 'rows.form' && lower(shown.fields[0]) === 'hej' && lower(shown.fields[1]) === 'swedish') ? undefined : 'want the form with hej, Swedish') },
];

const why = process.argv.includes('--why');
const runs = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.slice('--runs='.length) ?? 1);
const noJev = process.argv.includes('--no-jev');
const own = process.argv.slice(2).filter((arg) => !arg.startsWith('--') || arg.startsWith('--screen='));
const steps: readonly Step[] = own.length > 0 ? own.map((arg): Step => (arg.startsWith('--screen=') ? { open: arg.slice('--screen='.length) } : { ask: arg })) : RUN;

if (existsSync('.env')) process.loadEnvFile('.env');
const models = modelsFromEnv(process.env);
const said: string[] = [];
const decideWith = noJev ? undefined : models.decide;
const fillWith = models.fill;
const decide: Decide | undefined =
  decideWith &&
  (async (state, questions) => {
    const picked = await decideWith(state, questions);
    const yes = Object.entries(picked).flatMap(([name, one]) => (one.choice !== undefined ? [`${name}=${one.choice}`] : one.yes === true ? [name] : []));
    said.push(`  Jev: ${yes.join(' ')}`);
    return picked;
  });
const fill: Fill | undefined =
  fillWith &&
  (async (system, user, schema) => {
    const reply = await fillWith(system, user, schema);
    said.push(`  model: ${JSON.stringify(reply)}`);
    return reply;
  });

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
  const { decide: _jev, ...withoutJev } = models;
  const { server } = await boot({ ...withoutJev, ...(decide !== undefined ? { decide } : {}), ...(fill !== undefined ? { fill } : {}) });
  const shells = server.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');
  const session = await shells.session(null, null);
  const shell = session.shell;
  // Each message is answered when the line's `ask` call ends, whatever screen it leaves.
  let answers = 0;
  shell.onEndpoint((event) => {
    if (event.canvasId === 'line' && event.name === 'ask') answers += 1;
  });
  const dataOf = (canvas: string): Record<string, unknown> => {
    const active = shell.getState().canvases[canvas]?.active;
    return active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {});
  };
  const current = (): Record<string, unknown> => (dataOf('bar')['current'] ?? {}) as Record<string, unknown>;
  const screenOf = (): Screen => ({
    canvases: AREAS.flatMap((area): Shown[] => {
      const active = shell.getState().canvases[area]?.active;
      if (active === undefined) return [];
      const data = dataOf(area);
      const fields = Array.isArray(data['fields']) ? (data['fields'] as { value: string }[]).map((field) => field.value) : [];
      return [{ action: active.definitionId, read: String(data['read'] ?? ''), params: (data['params'] ?? {}) as Record<string, unknown>, fields, title: String(data['title'] ?? '') }];
    }),
    arrangement: String(current()['arrangement'] ?? ''),
    screen: String(current()['screen'] ?? ''),
  });
  const print = (screen: Screen): string => screen.canvases.map((shown, at) => `  ${AREAS[at]}: ${shown.action} — ${[shown.title, shown.read, JSON.stringify(shown.params) !== '{}' ? JSON.stringify(shown.params) : '', shown.fields.length > 0 ? JSON.stringify(shown.fields) : ''].filter((part) => part !== '').join(' · ')}`).join('\n');

  await until(() => (dataOf('b')['result'] as { value?: unknown } | undefined)?.value !== null);
  let right = 0;
  let scored = 0;
  console.log(`\n═══ run ${run}`);
  try {
    for (const step of steps) {
      if ('open' in step) {
        session.dispatch('bar', { type: 'ui:click', ref: 'screen', payload: step.open });
        await until(() => current()['screen'] === step.open);
        await new Promise((done) => setTimeout(done, 200));
        console.log(`» opened "${step.open}"`);
        continue;
      }
      shell.flattenRenderTree(shell.getShellRenderTree());
      const seen = answers;
      const started = performance.now();
      session.dispatch('line', { type: 'ui:model', ref: 'text', payload: step.ask });
      session.dispatch('line', { type: 'ui:key', ref: 'text', key: 'Enter' });
      const answered = await until(() => answers > seen);
      const took = performance.now() - started;
      times.push(took);
      await new Promise((done) => setTimeout(done, 300));
      const screen = screenOf();
      const miss = !answered ? 'no answer in 60 s' : step.want?.(screen);
      if (step.want !== undefined) {
        scored += 1;
        if (miss === undefined) right += 1;
        else misses.set(step.ask, (misses.get(step.ask) ?? 0) + 1);
      }
      const verdict = step.want === undefined ? '' : miss === undefined ? ' ✓' : ` ✗ ${miss}`;
      console.log(`» "${step.ask}" — ${Math.round(took)} ms · ${screen.arrangement}${verdict}\n${print(screen)}`);
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
