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
const keep = (area: string, from = area) => ({ area, keep: from });
const put = (area: string, canvas: object) => ({ area, ...canvas });
const say = (area: string, title: string, text: string) => ({ area, say: { title, text } });
const written = (areas: readonly [string, number][], columns: number): unknown => ({
  component: 'Answers',
  props: { columns },
  children: areas.map(([name, span]) => ({ component: 'Area', props: { name, span }, children: [{ component: 'CanvasSlot', props: { canvasId: name } }] })),
});

const REPLIES: Record<string, unknown[]> = {
  'Guten Tag is german': [{ reasoning: 'Filled in the add form with Guten Tag, German; the rest stays.', areas: [put('e', form('Guten Tag', 'German'))] }],
  'drop the bars': [{ areas: [{ area: 'c', drop: true }] }],
  'Show me every greeting': [{ areas: [put('a', table)], arrangement: 'single' }],
  'How many greetings are there?': [{ areas: [put('a', count)] }],
  'Which greetings are in German?': [{ areas: [put('a', german)] }],
  'and the count beside it': [{ areas: [keep('a'), put('b', count)], arrangement: 'pair' }],
  'the count first': [{ areas: [keep('a', 'b'), keep('b', 'a')] }],
  'Greetings in a language': [{ areas: [put('a', { ...german, input: { ...german.input, params: {} } }), { area: 'b', drop: true }] }, { areas: [put('a', german), { area: 'b', drop: true }] }],
  'keep what is not there': [{ areas: [keep('a', 'f'), put('c', count)] }, { areas: [keep('a')] }],
  'the count in German': [{ areas: [put('b', { ...count, input: { ...count.input, params: { language: 'German' } } })] }, { areas: [keep('a'), keep('b')] }],
  'the count twice': [{ areas: [keep('a'), keep('b'), keep('c', 'b')] }, { areas: [keep('a'), keep('b')] }],
  'Show me a pie chart': [{ areas: [put('a', { action: 'rows.pie', input: {}, intent: 'a pie' })] }, { areas: [put('a', { action: 'rows.pie', input: {}, intent: 'a pie' })] }],
  'The count and the languages, with the table wide beneath': [{ areas: [put('a', count), put('b', bars), put('c', table)], layout: written([['a', 1], ['b', 1], ['c', 2]], 2) }],
  'The count and the table, laid out by hand': [{ areas: [put('a', count), put('b', table), { area: 'c', drop: true }], layout: { component: 'Answers', props: { columns: 2 }, children: [{ component: 'Script', props: { src: 'x' } }] } }],
  'bon jour is french': [{ areas: [keep('a'), put('b', form('bon jour', 'French'))] }],
  'Add a greeting that says Hej': [{ areas: [put('a', form('Hej', 'Swedish'))], arrangement: 'single' }],
  'What can you do?': [{ areas: [say('a', 'What this app shows', 'Greetings: every one, how many, and per language. Ask, or add one.')], arrangement: 'single' }],
  'the count, and say what it is': [{ areas: [say('a', 'Greetings', 'How many greetings the app keeps.'), put('b', count)], arrangement: 'pair' }],
  'Show the overview': [{ screen: 'overview' }],
  'What is the weather in Vienna?': [{ reasoning: 'Nothing in this app shows the weather.', areas: [] }],
};

let asked: { state: Record<string, unknown>; questions: Record<string, unknown> }[] = [];
const decide: Decide = async (state, questions) => {
  asked.push({ state, questions });
  return Object.fromEntries(Object.entries(questions).map(([name, question]) => [name, question.type === 'choice' ? { choice: Object.keys(question.criteria)[0] ?? '', p: 0.9 } : { yes: false, p: 0.1 }]));
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
  const replies = REPLIES[message] ?? [{ areas: [] }];
  return schema.parse({ reasoning: 'Scripted.', ...(replies[Math.min(turn, replies.length - 1)] as object) });
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
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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
  let answered = 0;
  shell.onEndpoint((event) => {
    if (event.canvasId === 'line' && event.name === 'ask') answered += 1;
  });
  const on = (canvas: string): { action: string; id: string; data: Record<string, unknown> } => {
    const active = shell.getState().canvases[canvas]?.active;
    return { action: active?.definitionId ?? '', id: active?.id ?? '', data: active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {}) };
  };
  const areas = (): string => AREAS.map((area) => on(area).action).filter((action) => action !== '').join(' ');
  const ids = (): string => AREAS.map((area) => `${area}:${on(area).id}`).join(' ');
  type Shown = { question?: string; reasoning?: string; screen?: string; arrangement?: string; position?: number; total?: number; stack?: { position: number; label: string }[] };
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
  const said = (): string => String(on('line').data['error'] ?? '');
  // What a terminal does whenever the screen changes: draw every action on it. An input takes what is typed into it
  // once it has been drawn. A message is answered when the line's `ask` call ends, whatever it leaves on screen.
  const draw = (): void => void shell.flattenRenderTree(shell.getShellRenderTree());
  const lastPrompt = (): string => prompts[prompts.length - 1] ?? '';
  const ask = async (text: string): Promise<void> => {
    draw();
    const seen = answered;
    session.dispatch('line', { type: 'ui:model', ref: 'text', payload: text });
    session.dispatch('line', { type: 'ui:key', ref: 'text', key: 'Enter' });
    await until(() => answered > seen);
    await settle();
  };
  const openMenu = async (id: string): Promise<void> => {
    session.dispatch('bar', { type: 'ui:click', ref: 'screen', payload: id });
    await until(() => current().screen === id);
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

  const overviewIds = ids();
  await ask('Guten Tag is german');
  const jev = asked[asked.length - 1];
  check('Jev is asked about the message with the open screen: an intent for each canvas, the words too', jev?.state['message'] === 'Guten Tag is german' && Object.keys((jev?.state['open_screen'] ?? {}) as object).join(',') === 'a,b,c,d,e', JSON.stringify(jev?.state['open_screen']));
  check(
    'the model is given the open screen by area — where each area is, what each holds, the words too — and what Jev thinks',
    lastPrompt().includes('arrangement hero: a (the whole width); b c; d e') && lastPrompt().includes('- a: answer.text') && lastPrompt().includes('"count":5') && lastPrompt().includes('A FAST PICKER THINKS'),
    lastPrompt().slice(0, 600),
  );
  check('what the model is given of the rows leaves their ids out', !UUID.test(lastPrompt()), lastPrompt().match(UUID)?.[0] ?? '');
  check(
    'from the overview, "Guten Tag is german" fills in the form where it stands, and nothing else moves',
    ids() === overviewIds && current().arrangement === 'hero' && grid() === '2: a×2 b c d e' && fields('e')[0]?.value === 'Guten Tag' && fields('e')[1]?.value === 'German',
    `${ids()} vs ${overviewIds} — ${grid()} — ${JSON.stringify(fields('e'))}`,
  );
  check('what the model said it did is in the bar, under what was asked', current().reasoning === 'Filled in the add form with Guten Tag, German; the rest stays.' && JSON.stringify(shell.flattenRenderTree(shell.getShellRenderTree())).includes('the rest stays'), String(current().reasoning));
  const filledIds = ids();
  await ask('drop the bars');
  check('an area the model drops is emptied, and every other stays as it was', on('c').id === '' && ids().replace(/c:\S*/, '') === filledIds.replace(/c:\S*/, '') && current().arrangement === 'hero', `${ids()} vs ${filledIds}`);

  await ask('Show me every greeting');
  check('"Show me every greeting" is the table alone, laid out as one thing', areas() === 'rows.table' && grid() === '1: a', `${areas()} — ${grid()}`);
  check('the table reads the five hello-worlds', await until(() => rows('a', 'rows').length === 5), JSON.stringify(on('a').data['rows']));

  await ask('How many greetings are there?');
  check('an answer that names no arrangement keeps the one on screen', on('a').action === 'rows.stat' && current().arrangement === 'single' && (await until(() => value('a') === 5)), `${areas()} — ${String(current().arrangement)}`);

  await ask('Which greetings are in German?');
  check('a read asked with a value reads only what the value names', await until(() => on('a').action === 'rows.table' && rows('a', 'rows').length === 1), JSON.stringify(on('a').data['params']));
  const germanTable = on('a').id;
  await ask('and the count beside it');
  check('a canvas kept stays the same canvas, in its area; what is new goes where the model puts it', on('a').id === germanTable && areas() === 'rows.table rows.stat' && grid() === '2: a b', `${areas()} — ${grid()}`);
  await ask('the count first');
  check('a canvas the model keeps from another area moves there', areas() === 'rows.stat rows.table', areas());

  prompts = [];
  await ask('Greetings in a language');
  check(
    'an answer that leaves out a value its read is asked with is sent back once, saying so, and the second answer stands',
    prompts.length === 2 && (prompts[1] ?? '').includes('params.language, and it is missing') && on('a').action === 'rows.table' && rows('a', 'rows').length === 1,
    prompts[1]?.slice(-300) ?? '',
  );

  prompts = [];
  await ask('keep what is not there');
  check(
    'keeping an area that is empty, or using one the arrangement does not have, is sent back saying so',
    (prompts[1] ?? '').includes('there is nothing in area f to keep') && (prompts[1] ?? '').includes('has no area c'),
    prompts[1]?.slice(-400) ?? '',
  );

  await ask('and the count beside it');
  prompts = [];
  await ask('the count in German');
  check('a value a read does not take is sent back saying so', (prompts[1] ?? '').includes('takes no params.language'), prompts[1]?.slice(-300) ?? '');
  prompts = [];
  await ask('the count twice');
  check('the same canvas kept in two areas is sent back saying so', (prompts[1] ?? '').includes('show the same thing; show it once'), prompts[1]?.slice(-300) ?? '');

  const beforePie = ids();
  const stackBeforePie = total();
  prompts = [];
  await ask('Show me a pie chart');
  check(
    'an answer refused twice leaves the screen as it was, and the line says so',
    prompts.length === 2 && ids() === beforePie && total() === stackBeforePie && said().includes('did not fit'),
    `${ids()} — ${said()}`,
  );

  await ask('The count and the languages, with the table wide beneath');
  check('a layout the model wrote is the one the answer is laid out in', current().arrangement === 'written' && grid() === '2: a b c×2' && areas() === 'rows.stat rows.bars rows.table', `${String(current().arrangement)} — ${grid()} — ${areas()}`);

  await ask('The count and the table, laid out by hand');
  check('a layout the model wrote that is not a grid of areas is ignored, and the arrangement on screen stays', current().arrangement === 'written' && areas() === 'rows.stat rows.table', `${String(current().arrangement)} — ${areas()}`);

  await openMenu('greetings');
  const greetingsIds = ids();
  await ask('bon jour is french');
  check('with the greetings open, "bon jour is french" fills in the form where it stands, and nothing else moves', ids() === greetingsIds && fields('b')[0]?.value === 'bon jour' && fields('b')[1]?.value === 'French', `${ids()} vs ${greetingsIds} — ${JSON.stringify(fields('b'))}`);
  const tableThere = on('a').id;
  session.dispatch('b', { type: 'ui:click', ref: 'save' });
  check('saved, the form goes, and what was beside it stays where it is, reading the new row', await until(() => areas() === 'rows.table' && on('a').id === tableThere && rows('a', 'rows').length === 6), `${areas()}, ${rows('a', 'rows').length} rows`);

  await ask('Add a greeting that says Hej');
  const withForm = total();
  session.dispatch('a', { type: 'ui:click', ref: 'save' });
  check(
    'an answer left with nothing once its form is saved leaves the stack, and the first screen is gone back to',
    await until(() => areas() === OVERVIEW && current().screen === SCREENS[0]?.id && current().position === 1 && total() === withForm - 1),
    `${areas()}, ${String(current().position)} of ${total()}`,
  );
  check('the first screen counts both: 7', await until(() => value('b') === 7), JSON.stringify(on('b').data));

  const languages = SCREENS.find((screen) => screen.id === 'languages');
  await openMenu('languages');
  check('a screen from the menu shows its canvases in its arrangement', areas() === actionsOf(languages?.canvases ?? []) && current().arrangement === languages?.arrangement, `${areas()} — ${grid()}`);
  const stacked = total();
  await openMenu('overview');
  check('a screen already in the stack is gone back to, not stacked again', current().position === 1 && total() === stacked, `${String(current().position)} of ${total()}`);

  await ask('What can you do?');
  check('words the model says are placed where it says, with things to ask', on('a').action === 'answer.text' && on('a').data['title'] === 'What this app shows' && rows('a', 'examples').length === EXAMPLES.length && areas() === 'answer.text', areas());

  await ask('the count, and say what it is');
  check('words and canvases together, each in its area', areas() === 'answer.text rows.stat' && on('a').data['title'] === 'Greetings', areas());

  await ask('Show the overview');
  check('the model can answer with one of the app’s screens: gone back to where it is in the stack', current().screen === 'overview' && current().position === 1, `${String(current().position)} of ${total()}`);

  const beforeWeather = ids();
  const stackBeforeWeather = total();
  await ask('What is the weather in Vienna?');
  check('an answer that changes nothing leaves the screen as it was, and adds nothing to the stack', ids() === beforeWeather && total() === stackBeforeWeather && said() === '', `${ids()} — ${String(total())} — ${said()}`);
  check('and the bar says what was asked, and why nothing changed', current().question === 'What is the weather in Vienna?' && current().reasoning === 'Nothing in this app shows the weather.', JSON.stringify(current()).slice(0, 200));

  unreachable = true;
  await ask('Show me every greeting');
  check('a model that cannot be reached leaves the screen as it was, and the line says so', ids() === beforeWeather && said().includes('could not be reached'), said());
  unreachable = false;

  session.dispatch('bar', { type: 'ui:click', ref: 'forward' });
  check('forward from the first screen is the answer after it, as it was', await until(() => current().position === 2 && current().question === 'Guten Tag is german' && fields('e')[0]?.value === 'Guten Tag'), `position ${String(current().position)}, ${areas()}`);
  session.dispatch('bar', { type: 'ui:click', ref: 'back' });
  check('back is the first screen again', await until(() => current().position === 1 && current().screen === 'overview'), `position ${String(current().position)}`);

  session.dispatch('bar', { type: 'ui:click', ref: 'stack' });
  const stack = current().stack ?? [];
  check(
    'the counter opens the stack: every answer, by what was asked or the screen it is',
    on('bar').data['listing'] === true && stack.length === total() && stack[0]?.label === SCREENS[0]?.label && stack[1]?.label === 'Guten Tag is german',
    JSON.stringify(stack.slice(0, 3)),
  );
  session.dispatch('bar', { type: 'ui:click', ref: 'entry', payload: 4 });
  check('an answer picked from the stack is shown as it was, and the list closes', await until(() => current().position === 4 && areas() === 'rows.table' && on('bar').data['listing'] === false), `${String(current().position)}, ${areas()}`);
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
  session.dispatch('line', { type: 'ui:model', ref: 'text', payload: 'Show me every greeting' });
  session.dispatch('line', { type: 'ui:key', ref: 'text', key: 'Enter' });
  const first = (): string => AREAS.map((area) => session.shell.getState().canvases[area]?.active?.definitionId ?? '').filter((action) => action !== '').join(' ');
  check('when Jev cannot answer, the model answers alone', await until(() => first() === 'rows.table'), first());
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
  const line = (): Record<string, unknown> => {
    const active = session.shell.getState().canvases['line']?.active;
    return active === undefined ? {} : (session.shell.getRuntime(active.id)?.getData() ?? {});
  };
  check('with no key, the line names the key, and the screen stays as it was', await until(() => String(line()['error'] ?? '').includes('GROQ_API_KEY')), JSON.stringify(line()));
} finally {
  keyless.close();
}

console.log(failures === 0 ? '[pass] compose: all checks passed' : `[fail] compose: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
