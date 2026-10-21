import { renderDocument } from '@niscorp/moss';
import type { z } from 'zod';
import { EXAMPLES, SCREENS } from '../app/screens';
import { AREAS } from '../app/shell/areas';
import { greetingAdd, greetingsCount, greetingsInLanguage, greetingsList, greetingsPerLanguage } from '../app/vex/greetings.entries';
import { boot } from '../server/boot';
import type { Decide, Fill, Models } from '../server/compose';
import { drawing } from '../server/document';

// Offline, and the same every run: a decision model that finds nothing likely, and a chat model that answers each
// message with the replies scripted for it, one per call.
const COLUMNS = [
  { key: 'text', label: 'Greeting' },
  { key: 'language', label: 'Language' },
];
const table = { action: 'rows.table', input: { title: 'Greetings', read: greetingsList.fingerprint, params: {}, columns: COLUMNS }, intent: 'every greeting' };
const count = { action: 'rows.stat', input: { title: 'Greetings', read: greetingsCount.fingerprint, params: {}, label: 'greetings' }, intent: 'how many greetings there are' };
const bars = { action: 'rows.bars', input: { title: 'Greetings per language', read: greetingsPerLanguage.fingerprint, params: {} }, intent: 'greetings per language' };
const german = { action: 'rows.table', input: { title: 'Greetings in German', read: greetingsInLanguage.fingerprint, params: { language: 'German' }, columns: COLUMNS }, intent: 'the greetings in German' };
const form = (text: string, language: string) => ({
  action: 'rows.form',
  input: {
    title: 'Add a greeting',
    write: greetingAdd.fingerprint,
    fields: [
      { key: 'text', label: 'Greeting', value: text },
      { key: 'language', label: 'Language', value: language },
    ],
  },
  intent: 'a form to add a greeting',
});
const written = (areas: readonly [string, number][], columns: number): unknown => ({
  component: 'Answers',
  props: { columns },
  children: areas.map(([name, span]) => ({ component: 'Area', props: { name, span }, children: [{ component: 'CanvasSlot', props: { canvasId: name } }] })),
});

const REPLIES: Record<string, unknown[]> = {
  'Show me every greeting': [{ canvases: [table], arrangement: 'single' }],
  'How many greetings are there?': [{ canvases: [count], arrangement: 'single' }],
  'Which greetings are in German?': [{ canvases: [german], arrangement: 'single' }],
  'and the count beside it': [{ canvases: [german, count], arrangement: 'pair' }],
  'bon jour is french': [{ canvases: [table, form('bon jour', 'French')], arrangement: 'pair' }],
  'the count first': [{ canvases: [count, german], arrangement: 'pair' }],
  'Everything about the greetings': [{ canvases: [count, bars, table], arrangement: 'single' }],
  'The count and the languages, with the table wide beneath': [{ canvases: [count, bars, table], layout: written([['a', 1], ['b', 1], ['c', 2]], 2) }],
  'The count and the table, laid out by hand': [{ canvases: [count, table], layout: { component: 'Answers', props: { columns: 2 }, children: [{ component: 'Script', props: { src: 'x' } }] } }],
  'Greetings in a language': [{ canvases: [{ ...german, input: { ...german.input, params: {} } }] }, { canvases: [german], arrangement: 'single' }],
  'Show me a pie chart': [{ canvases: [{ action: 'rows.pie', input: {}, intent: 'a pie' }] }, { canvases: [{ action: 'rows.pie', input: {}, intent: 'a pie' }] }],
  'Add a greeting that says Servus': [{ canvases: [form('Servus', 'German')], arrangement: 'single' }],
  'What can you do?': [{ canvases: [], say: { title: 'What this app shows', text: 'Greetings: every one, how many, and per language. Ask, or add one.' } }],
  'the count, and say what it is': [{ canvases: [count], say: { title: 'Greetings', text: 'How many greetings the app keeps.' }, arrangement: 'pair' }],
  'Show the overview': [{ canvases: [], screen: 'overview' }],
  'What is the weather in Vienna?': [{ canvases: [] }],
};

let asked: { state: Record<string, unknown>; questions: Record<string, unknown> }[] = [];
const decide: Decide = async (state, questions) => {
  asked.push({ state, questions });
  return Object.fromEntries(
    Object.entries(questions).map(([name, question]) => {
      if (question.type === 'choice') return [name, { choice: Object.keys(question.criteria)[0] ?? '', p: 0.9 }];
      return [name, { yes: false, p: 0.1 }];
    }),
  );
};

let prompts: string[] = [];
const turns = new Map<string, number>();
let unreachable = false;
const fill: Fill = async <T>(_system: string, user: string, schema: z.ZodType<T>): Promise<T> => {
  prompts.push(user);
  if (unreachable) throw new Error('the provider did not answer');
  const message = /^MESSAGE: (.*)$/m.exec(user)?.[1] ?? '';
  const turn = turns.get(message) ?? 0;
  turns.set(message, turn + 1);
  const replies = REPLIES[message] ?? [{ canvases: [] }];
  return schema.parse(replies[Math.min(turn, replies.length - 1)]);
};

let failures = 0;
const check = (name: string, passed: boolean, detail = ''): void => {
  console.log(`${passed ? '[pass]' : '[fail]'} ${name}${!passed && detail !== '' ? ` — ${detail}` : ''}`);
  if (!passed) failures += 1;
};

const until = async (condition: () => boolean, ms = 5000): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) return false;
    await new Promise((done) => setTimeout(done, 10));
  }
  return true;
};
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 150));

const actionsOf = (canvases: readonly { action: string }[]): string => canvases.map((canvas) => canvas.action).join(' ');
const OVERVIEW = actionsOf(SCREENS[0]?.canvases ?? []);

const models: Models = { decide, fill, missing: [] };
const { server } = await boot(models);
try {
  const shells = server.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');

  const template = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
  const page = await renderDocument({ ...drawing, server, template, request: { path: '/', cookie: null } });
  check('the page arrives drawn: the frame, the screens, the first screen, the line to ask in', page.drawn && ['k-frame', 'k-prompt', 'Overview', 'Greetings per language'].every((part) => page.html.includes(part)), page.html.slice(0, 300));

  const session = await shells.session(null, null);
  const shell = session.shell;
  const on = (canvas: string): { action: string; id: string; data: Record<string, unknown> } => {
    const active = shell.getState().canvases[canvas]?.active;
    return { action: active?.definitionId ?? '', id: active?.id ?? '', data: active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {}) };
  };
  const areas = (): string => AREAS.map((area) => on(area).action).filter((action) => action !== '').join(' ');
  type Shown = { question?: string; screen?: string; arrangement?: string; position?: number; total?: number; stack?: { position: number; label: string }[] };
  // The grid the frame's `answers` region holds, as the shell draws it: its columns, and each area's name and span.
  const grid = (): string => {
    const find = (nodes: unknown): Record<string, unknown> | undefined => {
      for (const node of Array.isArray(nodes) ? nodes : []) {
        if (node !== null && typeof node === 'object') {
          const record = node as Record<string, unknown>;
          if (record['name'] === 'Answers') return record;
          const inner = find(record['children']);
          if (inner !== undefined) return inner;
        }
      }
      return undefined;
    };
    const answers = find(shell.getShellRenderTree());
    const props = (answers?.['props'] ?? {}) as Record<string, unknown>;
    const held = ((answers?.['children'] ?? []) as Record<string, unknown>[]).map((area) => {
      const own = (area['props'] ?? {}) as Record<string, unknown>;
      return `${String(own['name'])}${Number(own['span'] ?? 1) > 1 ? `×${String(own['span'])}` : ''}`;
    });
    return `${String(props['columns'])}: ${held.join(' ')}`;
  };
  const current = (): Shown => (on('bar').data['current'] ?? {}) as Shown;
  const total = (): number => Number(current().total);
  // What a terminal does whenever the screen changes: draw every action on it. An input takes what is typed into it
  // once it has been drawn.
  const draw = (): void => void shell.flattenRenderTree(shell.getShellRenderTree());
  const lastPrompt = (): string => prompts[prompts.length - 1] ?? '';
  const ask = async (text: string, done: () => boolean = () => current().question === text): Promise<void> => {
    draw();
    session.dispatch('line', { type: 'ui:model', ref: 'text', payload: text });
    session.dispatch('line', { type: 'ui:key', ref: 'text', key: 'Enter' });
    await until(() => done() && on('line').data['asking'] === false);
    await settle();
  };
  const rows = (canvas: string, key: string): unknown[] => {
    const value = on(canvas).data[key];
    return Array.isArray(value) ? value : [];
  };
  const value = (canvas: string): unknown => (on(canvas).data['result'] as { value?: unknown } | undefined)?.value;
  const fields = (canvas: string): { key: string; value: string }[] => rows(canvas, 'fields') as { key: string; value: string }[];

  check('the app opens on the first screen, every one of its canvases an area of its own, and the stack starts there', areas() === OVERVIEW && on('bar').action === 'answer.bar' && on('line').action === 'ask.line' && current().position === 1 && total() === 1, areas());
  check('the frame’s region holds the first screen’s arrangement', current().arrangement === SCREENS[0]?.arrangement && grid() === '2: a×2 b c d e', `${String(current().arrangement)} — ${grid()}`);
  check('the first screen loads what it shows', await until(() => value('b') === 5), JSON.stringify(on('b').data));

  await ask('Show me every greeting');
  const jev = asked[asked.length - 1];
  check('Jev is asked about the message with the open screen: an intent for each canvas', jev?.state['message'] === 'Show me every greeting' && Object.keys((jev?.state['open_screen'] ?? {}) as object).join(',') === 'a,b,c,d,e', JSON.stringify(jev?.state['open_screen']));
  check('the model is given the open screen — each canvas’s action, intent, input and what it holds — and what Jev thinks', /- b: rows\.stat — how many greetings there are/.test(lastPrompt()) && lastPrompt().includes('"count":5') && lastPrompt().includes('A FAST PICKER THINKS'), lastPrompt().slice(0, 600));
  check('"Show me every greeting" is the table alone, laid out as one thing', areas() === 'rows.table' && grid() === '1: a', `${areas()} — ${grid()}`);
  check('the table reads the five hello-worlds', await until(() => rows('a', 'rows').length === 5), JSON.stringify(on('a').data['rows']));

  await ask('How many greetings are there?');
  check('"How many greetings are there?" is one number: 5', await until(() => on('a').action === 'rows.stat' && value('a') === 5), JSON.stringify(on('a').data));

  await ask('Which greetings are in German?');
  check('a read asked with a value reads only what the value names', await until(() => on('a').action === 'rows.table' && rows('a', 'rows').length === 1), JSON.stringify(on('a').data['params']));
  const germanTable = on('a').id;
  await ask('and the count beside it');
  check('what stays on screen stays the same canvas, in its place, and what is new follows it', on('a').id === germanTable && areas() === 'rows.table rows.stat' && grid() === '2: a b', `${areas()} — ${grid()}`);
  await ask('the count first');
  check('an order the model gives stands: what was on screen moves when the message asks', areas() === 'rows.stat rows.table', areas());

  session.dispatch('bar', { type: 'ui:click', ref: 'screen', payload: 'greetings' });
  await until(() => current().screen === 'greetings');
  await settle();
  const tableThere = on('a').id;
  const formThere = on('b').id;
  await ask('bon jour is french');
  check(
    'with the greetings open, "bon jour is french" fills in the form where it stands, and nothing else moves',
    on('a').id === tableThere && on('b').id === formThere && fields('b')[0]?.value === 'bon jour' && fields('b')[1]?.value === 'French',
    `${areas()} — ${JSON.stringify(fields('b'))}`,
  );

  await ask('Everything about the greetings');
  check('an arrangement asked for without room for the canvases gives way to the smallest that has it', current().arrangement === 'trio' && grid() === '3: a b c', `${String(current().arrangement)} — ${grid()}`);

  await ask('The count and the languages, with the table wide beneath');
  check('a layout the model wrote is the one the answer is laid out in', current().arrangement === 'written' && grid() === '2: a b c×2' && areas() === 'rows.stat rows.bars rows.table', `${String(current().arrangement)} — ${grid()} — ${areas()}`);

  await ask('The count and the table, laid out by hand');
  check('a layout the model wrote that is not a grid of areas is ignored, and an arrangement that fits stands', current().arrangement === 'pair' && grid() === '2: a b', `${String(current().arrangement)} — ${grid()}`);

  prompts = [];
  await ask('Greetings in a language');
  check(
    'an answer that leaves out a value its read is asked with is sent back once, saying so, and the second answer stands',
    prompts.length === 2 && (prompts[1] ?? '').includes('params.language, and it is missing') && on('a').action === 'rows.table' && rows('a', 'rows').length === 1,
    prompts[1]?.slice(-300) ?? '',
  );

  const beforePie = areas();
  prompts = [];
  await ask('Show me a pie chart');
  check(
    'an answer refused twice is a line saying so above what was on screen, which stays',
    prompts.length === 2 && on('a').action === 'answer.text' && on('a').data['title'] === 'That did not come together' && areas() === `answer.text ${beforePie}`,
    `${areas()} after ${beforePie}`,
  );

  await ask('Add a greeting that says Servus');
  check('"Add a greeting that says Servus" opens the form, filled in by the model', await until(() => on('a').action === 'rows.form' && fields('a')[0]?.value === 'Servus' && fields('a')[1]?.value === 'German'), JSON.stringify(fields('a')));
  const withForm = total();
  session.dispatch('a', { type: 'ui:click', ref: 'save' });
  check(
    'saved, the form goes; an answer left with nothing leaves the stack, and the first screen is gone back to',
    await until(() => areas() === OVERVIEW && current().screen === SCREENS[0]?.id && current().position === 1 && total() === withForm - 1),
    `${areas()}, ${String(current().position)} of ${total()}`,
  );
  check('the first screen counts it: 6', await until(() => AREAS.some((area) => on(area).action === 'rows.stat' && value(area) === 6)), areas());

  const languages = SCREENS.find((screen) => screen.id === 'languages');
  session.dispatch('bar', { type: 'ui:click', ref: 'screen', payload: 'languages' });
  check('a screen from the menu shows its canvases in its arrangement', await until(() => current().screen === 'languages' && areas() === actionsOf(languages?.canvases ?? []) && current().arrangement === languages?.arrangement), `${areas()} — ${grid()}`);
  const stacked = total();
  session.dispatch('bar', { type: 'ui:click', ref: 'screen', payload: 'overview' });
  check('a screen already in the stack is gone back to, not stacked again', await until(() => current().screen === 'overview' && current().position === 1 && total() === stacked), `${String(current().position)} of ${total()}`);

  await ask('What can you do?');
  check('a question about the app itself is answered in a few words, with things to ask', on('a').action === 'answer.text' && on('a').data['title'] === 'What this app shows' && rows('a', 'examples').length === EXAMPLES.length && areas() === 'answer.text', areas());

  await ask('the count, and say what it is');
  check('words the model says come first, above its canvases', areas() === 'answer.text rows.stat' && on('a').data['title'] === 'Greetings', areas());

  const position = Number(current().position);
  await ask('Show the overview', () => current().screen === 'overview');
  check('the model can answer with one of the app’s screens: gone back to where it is in the stack', current().screen === 'overview' && current().position === 1 && total() >= position, `${String(current().position)} of ${total()}`);

  await ask('What is the weather in Vienna?');
  check('a message nothing answers is a line saying so above what was on screen', on('a').action === 'answer.text' && on('a').data['title'] === 'Nothing here answers that yet' && areas() === `answer.text ${actionsOf((SCREENS[0]?.canvases ?? []).filter((canvas) => canvas.action !== 'answer.text'))}`, areas());

  unreachable = true;
  await ask('Show me every greeting');
  check('a model that cannot be reached is a line saying so, and what was on screen stays', on('a').action === 'answer.text' && on('a').data['title'] === 'No answer this time', areas());
  unreachable = false;

  const weather = Number(current().position);
  session.dispatch('bar', { type: 'ui:click', ref: 'back' });
  check('back is the answer before, as it was', await until(() => Number(current().position) === weather - 1 && on('a').data['title'] === 'Nothing here answers that yet'), `position ${String(current().position)}, ${areas()}`);
  session.dispatch('bar', { type: 'ui:click', ref: 'forward' });
  check('forward is the one after again', await until(() => Number(current().position) === weather && on('a').data['title'] === 'No answer this time'), `position ${String(current().position)}, ${areas()}`);

  session.dispatch('bar', { type: 'ui:click', ref: 'stack' });
  const stack = current().stack ?? [];
  check(
    'the counter opens the stack: every answer, by what was asked or the screen it is',
    on('bar').data['listing'] === true && stack.length === total() && stack[0]?.label === SCREENS[0]?.label && stack[1]?.label === 'Show me every greeting',
    JSON.stringify(stack.slice(0, 3)),
  );
  session.dispatch('bar', { type: 'ui:click', ref: 'entry', payload: 2 });
  check('an answer picked from the stack is shown as it was, and the list closes', await until(() => current().position === 2 && areas() === 'rows.table' && on('bar').data['listing'] === false), `${String(current().position)}, ${areas()}`);
} finally {
  server.close();
}

asked = [];
const { server: jevless } = await boot({
  decide: async () => {
    throw new Error('Jev did not answer');
  },
  fill,
  missing: [],
});
try {
  const shells = jevless.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');
  const session = await shells.session(null, null);
  session.shell.flattenRenderTree(session.shell.getShellRenderTree());
  session.dispatch('line', { type: 'ui:model', ref: 'text', payload: 'How many greetings are there?' });
  session.dispatch('line', { type: 'ui:key', ref: 'text', key: 'Enter' });
  const first = (): string => session.shell.getState().canvases['a']?.active?.definitionId ?? '';
  check('when Jev cannot answer, the model answers alone', await until(() => first() === 'rows.stat'), first());
} finally {
  jevless.close();
}

const { server: keyless } = await boot({ missing: ['GROQ_API_KEY'] });
try {
  const shells = keyless.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');
  const session = await shells.session(null, null);
  session.shell.flattenRenderTree(session.shell.getShellRenderTree());
  session.dispatch('line', { type: 'ui:model', ref: 'text', payload: 'Show me every greeting' });
  session.dispatch('line', { type: 'ui:key', ref: 'text', key: 'Enter' });
  const first = (): Record<string, unknown> => {
    const active = session.shell.getState().canvases['a']?.active;
    return active === undefined ? {} : (session.shell.getRuntime(active.id)?.getData() ?? {});
  };
  check('with no key, a message is answered with a line naming the key, above what was on screen', await until(() => String(first()['text'] ?? '').includes('GROQ_API_KEY')), JSON.stringify(first()));
} finally {
  keyless.close();
}

console.log(failures === 0 ? '[pass] compose: all checks passed' : `[fail] compose: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
