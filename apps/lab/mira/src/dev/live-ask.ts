import { existsSync } from 'node:fs';
import { z } from 'zod';
import { AREAS } from '../app/shell/areas';
import { boot } from '../server/boot';
import type { Decide, Fill } from '../server/compose';
import { modelsFromEnv } from '../server/models';

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
type Screen = { canvases: Shown[]; arrangement: string; screen: string; said: string; reasoning: string; title: string };
type Step = { ask: string; want?: (now: Screen, before: Screen) => string | undefined } | { open: string };

const lower = (value: unknown): string => String(value ?? '').toLowerCase();
const at = (screen: Screen, area: string): Shown | undefined => screen.canvases.find((shown) => shown.area === area);
const is = (shown: Shown | undefined, action: string, read?: string): boolean => shown?.action === action && (read === undefined || shown.read === read);
const has = (screen: Screen, action: string, read?: string): boolean => screen.canvases.some((shown) => is(shown, action, read));

// Two areas showing the same thing is never the screen a message wants.
const twice = (now: Screen): string | undefined => {
  const seen = now.canvases.filter((shown) => shown.action !== 'answer.text').map((shown) => JSON.stringify([shown.action, shown.read, shown.params, shown.fields]));
  return new Set(seen).size === seen.length ? undefined : 'the same thing is shown twice';
};

// Every one of these areas holds the canvas it held before, and the arrangement is the one it was.
const untouched = (now: Screen, before: Screen, ...areas: string[]): string | undefined => {
  const moved = areas.filter((area) => at(now, area)?.id === undefined || at(now, area)?.id !== at(before, area)?.id);
  if (moved.length > 0) return `area ${moved.join(', ')} changed`;
  return now.arrangement === before.arrangement ? undefined : `the arrangement went from ${before.arrangement} to ${now.arrangement}`;
};

// The form in an area, filled in with these values, in place.
const filled = (now: Screen, before: Screen, area: string, text: string, language?: string): string | undefined => {
  const form = at(now, area);
  if (form?.id !== at(before, area)?.id) return `the form in ${area} was replaced`;
  return lower(form?.fields[0]) === text && (language === undefined || lower(form?.fields[1]) === language) ? undefined : `the form holds ${JSON.stringify(form?.fields)}`;
};

const RUN: readonly Step[] = [
  { open: 'overview' },
  { ask: 'Guten Tag is german', want: (now, before) => untouched(now, before, 'a', 'b', 'c', 'd') ?? filled(now, before, 'e', 'guten tag', 'german') },
  { open: 'overview' },
  { ask: 'bon jour is french', want: (now, before) => untouched(now, before, 'a', 'b', 'c', 'd') ?? filled(now, before, 'e', 'bon jour', 'french') },
  { open: 'overview' },
  { ask: 'Add a greeting that says Servus', want: (now, before) => untouched(now, before, 'a', 'b', 'c', 'd') ?? filled(now, before, 'e', 'servus') },
  { open: 'greetings' },
  { ask: 'bon jour is french', want: (now, before) => untouched(now, before, 'a') ?? filled(now, before, 'b', 'bon jour', 'french') },
  { open: 'overview' },
  { ask: 'show overview + app overview', want: (now) => (now.screen === 'overview' ? undefined : 'want the overview') },
  { open: 'overview' },
  { ask: 'What can you do?', want: (now) => (has(now, 'answer.text') ? undefined : 'want words') },
  { open: 'overview' },
  { ask: 'the count big at the top, the bars and the table below it', want: (now) => (is(now.canvases[0], 'rows.stat', 'greetings/count') && has(now, 'rows.bars') && has(now, 'rows.table') ? undefined : 'want the count first, the bars and the table beneath') },
  { open: 'overview' },
  { ask: 'Which greetings are in German?', want: (now) => (now.canvases.some((shown) => is(shown, 'rows.table', 'greetings/in-language') && shown.params['language'] === 'German') ? undefined : 'want the greetings in German') },
  {
    ask: 'and the count beside it',
    want: (now, before) => {
      const german = before.canvases.find((shown) => shown.params['language'] === 'German');
      return german !== undefined && at(now, german.area)?.id === german.id && has(now, 'rows.stat', 'greetings/count') ? undefined : 'want the German greetings where they were, and the count';
    },
  },
  {
    ask: 'only the Italian ones',
    want: (now, before) => {
      const german = before.canvases.find((shown) => shown.params['language'] === 'German');
      const count = before.canvases.find((shown) => shown.action === 'rows.stat');
      const there = german === undefined ? undefined : at(now, german.area);
      return there?.params['language'] === 'Italian' && (count === undefined || at(now, count.area)?.id === count.id) ? undefined : 'want the Italian greetings where the German were, and the count untouched';
    },
  },
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
const decideWith = noJev ? undefined : models.decide;
const fillWith = models.fill;
const decide: Decide | undefined =
  decideWith &&
  (async (state, questions) => {
    const picked = await decideWith(state, questions);
    if (prompts) said.push(`──── JEV STATE
${JSON.stringify(state, null, 2)}
──── JEV QUESTIONS
${JSON.stringify(questions, null, 2)}
──── JEV ANSWERED
${JSON.stringify(picked, null, 2)}`);
    const yes = Object.entries(picked).flatMap(([name, one]) => (one.choice !== undefined ? [`${name}=${one.choice}`] : one.yes === true ? [name] : []));
    said.push(`  Jev: ${yes.join(' ')}`);
    return picked;
  });
const fill: Fill | undefined =
  fillWith &&
  (async (system, user, schema) => {
    const reply = await fillWith(system, user, schema);
    if (prompts) said.push(`──── MODEL SYSTEM
${system}
──── MODEL USER
${user}
──── MODEL REPLY SCHEMA
${JSON.stringify(z.toJSONSchema(schema))}
──── MODEL ANSWERED
${JSON.stringify(reply, null, 2)}`);
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
    if (event.canvasId === 'dock' && event.name === 'ask') answers += 1;
  });
  const dataOf = (canvas: string): Record<string, unknown> => {
    const active = shell.getState().canvases[canvas]?.active;
    return active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {});
  };
  const current = (): Record<string, unknown> => (dataOf('dock')['current'] ?? {}) as Record<string, unknown>;
  const screenOf = (): Screen => ({
    canvases: AREAS.flatMap((area): Shown[] => {
      const active = shell.getState().canvases[area]?.active;
      if (active === undefined) return [];
      const data = dataOf(area);
      const fields = Array.isArray(data['fields']) ? (data['fields'] as { value: string }[]).map((field) => field.value) : [];
      return [{ area, id: active.id, action: active.definitionId, read: String(data['read'] ?? ''), params: (data['params'] ?? {}) as Record<string, unknown>, fields, title: String(data['title'] ?? '') }];
    }),
    arrangement: String(current()['arrangement'] ?? ''),
    screen: String(current()['screen'] ?? ''),
    said: String(dataOf('dock')['error'] ?? ''),
    reasoning: String(current()['reasoning'] ?? ''),
    title: String(current()['label'] ?? ''),
  });
  const print = (screen: Screen): string => screen.canvases.map((shown) => `  ${shown.area}: ${shown.action} — ${[shown.title, shown.read, JSON.stringify(shown.params) !== '{}' ? JSON.stringify(shown.params) : '', shown.fields.length > 0 ? JSON.stringify(shown.fields) : ''].filter((part) => part !== '').join(' · ')}`).join('\n');

  await until(() => (dataOf('b')['result'] as { value?: unknown } | undefined)?.value !== null);
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
      console.log(`» "${step.ask}" — ${Math.round(took)} ms · ${screen.arrangement}${verdict}${screen.said !== '' ? ` · the line says: ${screen.said}` : ''}\n  title: ${screen.title} · reasoning: ${screen.reasoning}\n${print(screen)}`);
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
