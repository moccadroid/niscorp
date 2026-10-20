import { renderDocument } from '@niscorp/moss';
import type { z } from 'zod';
import { ANSWERS } from '../app/answers';
import { SCREENS } from '../app/screens';
import { AREAS } from '../app/shell/areas';
import { boot } from '../server/boot';
import type { Decide, Fill, Models } from '../server/compose';
import { drawing } from '../server/document';

// Offline, and the same every run: a decision model that says yes to the prepared answers each message is scripted
// to reach, and picks a value the message names; a chat model that answers a scripted reply.
const REACHES: Record<string, string[]> = {
  'Show me every greeting': ['greetings.table'],
  'How many greetings are there?': ['greetings.count'],
  'Greetings per language': ['greetings.per-language'],
  'Which greetings are in German?': ['greetings.in-language'],
  'Add a greeting that says Servus': ['greetings.add'],
  'Everything about the greetings': ['greetings.count', 'greetings.per-language', 'greetings.table'],
  'Show the overview': ['screen:overview'],
  'Greetings and languages side by side': ['greetings.table', 'greetings.per-language'],
};
// The arrangement the decision model picks for a message; for any other, the first, which holds one answer.
const LAID: Record<string, string> = {
  'Greetings and languages side by side': 'pair',
};
const written = (areas: readonly [string, number][], columns: number): unknown => ({
  component: 'Answers',
  props: { columns },
  children: areas.map(([name, span]) => ({ component: 'Area', props: { name, span }, children: [{ component: 'CanvasSlot', props: { canvasId: name } }] })),
});
const REPLIES: Record<string, unknown> = {
  'Add a greeting that says Servus': { answers: [{ id: 'greetings.add', set: { 'fields.0.value': 'Servus', 'fields.1.value': 'German' } }] },
  'Everything about the greetings': { answers: [{ id: 'greetings.per-language' }, { id: 'greetings.count' }, { id: 'greetings.table' }] },
  'how many are there': { answers: [{ id: 'greetings.count' }] },
  'What can you do?': { answers: [], say: { title: 'What this app shows', text: 'Greetings: every one, how many, and per language. Ask, or add one.' } },
  'show overview + app overview': { answers: [{ id: 'screen:overview' }], say: { title: 'What this app is', text: 'It keeps greetings in many languages. Ask for them, count them, or add one.' } },
  'The count and the languages, with the table wide beneath': {
    answers: [{ id: 'greetings.count' }, { id: 'greetings.per-language' }, { id: 'greetings.table' }],
    layout: written([['a', 1], ['b', 1], ['c', 2]], 2),
  },
  'The count and the table, laid out by hand': {
    answers: [{ id: 'greetings.count' }, { id: 'greetings.table' }],
    layout: { component: 'Answers', props: { columns: 2 }, children: [{ component: 'Script', props: { src: 'x' } }] },
  },
};

const decide: Decide = async (state, questions) =>
  Object.fromEntries(
    Object.entries(questions).map(([name, question]) => {
      const message = String(state['message']);
      if (question.type === 'noul') {
        const screen = SCREENS.find((candidate) => question.instructions.includes(`the screen "${candidate.label}"`));
        const id = screen !== undefined ? `screen:${screen.id}` : ANSWERS.find((candidate) => question.instructions.includes(candidate.shows))?.id;
        return [name, { yes: id !== undefined && (REACHES[message] ?? []).includes(id), p: 0.9 }];
      }
      if (name === 'arrangement') return [name, { choice: LAID[message] ?? Object.keys(question.criteria)[0] ?? '', p: 0.9 }];
      const named = Object.entries(question.criteria).find(([key, value]) => key !== 'none' && message.toLowerCase().includes(value.toLowerCase()));
      return [name, { choice: named?.[0] ?? 'none', p: 0.9 }];
    }),
  );

const fill: Fill = async <T>(_system: string, user: string, schema: z.ZodType<T>): Promise<T> => {
  const message = /^Message: (.*)$/m.exec(user)?.[1] ?? '';
  return schema.parse(REPLIES[message] ?? { answers: [] });
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

const actionsOf = (ids: readonly string[]): string => ids.map((id) => ANSWERS.find((answer) => answer.id === id)?.action ?? '').join(' ');
const OVERVIEW = actionsOf(SCREENS[0]?.answers ?? []);
// The first screen without its own words, for when something else is said above it.
const OVERVIEW_UNSAID = actionsOf((SCREENS[0]?.answers ?? []).filter((id) => ANSWERS.find((answer) => answer.id === id)?.action !== 'answer.text'));

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
  const on = (canvas: string): { action: string; data: Record<string, unknown> } => {
    const active = shell.getState().canvases[canvas]?.active;
    return { action: active?.definitionId ?? '', data: active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {}) };
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
    const areas = ((answers?.['children'] ?? []) as Record<string, unknown>[]).map((area) => {
      const own = (area['props'] ?? {}) as Record<string, unknown>;
      return `${String(own['name'])}${Number(own['span'] ?? 1) > 1 ? `×${String(own['span'])}` : ''}`;
    });
    return `${String(props['columns'])}: ${areas.join(' ')}`;
  };
  const current = (): Shown => (on('bar').data['current'] ?? {}) as Shown;
  const total = (): number => Number(current().total);
  // What a terminal does whenever the screen changes: draw every action on it. An input takes what is typed into it
  // once it has been drawn.
  const draw = (): void => void shell.flattenRenderTree(shell.getShellRenderTree());
  const ask = async (text: string): Promise<void> => {
    draw();
    session.dispatch('line', { type: 'ui:model', ref: 'text', payload: text });
    session.dispatch('line', { type: 'ui:key', ref: 'text', key: 'Enter' });
    await until(() => current().question === text && on('line').data['asking'] === false);
    await settle();
  };
  const rows = (canvas: string, key: string): unknown[] => {
    const value = on(canvas).data[key];
    return Array.isArray(value) ? value : [];
  };
  const value = (canvas: string): unknown => (on(canvas).data['result'] as { value?: unknown } | undefined)?.value;

  check('the app opens on the first screen, every one of its answers an area of its own, and the stack starts there', areas() === OVERVIEW && on('bar').action === 'answer.bar' && on('line').action === 'ask.line' && current().position === 1 && total() === 1, areas());

  check('the frame’s region holds the first screen’s arrangement', current().arrangement === SCREENS[0]?.arrangement && grid() === '2: a×2 b c d e', `${String(current().arrangement)} — ${grid()}`);

  await ask('Show me every greeting');
  check('"Show me every greeting" is the table alone, in the first area, laid out as one thing', areas() === 'rows.table' && grid() === '1: a', `${areas()} — ${grid()}`);
  check('the table reads the five hello-worlds', await until(() => rows('a', 'rows').length === 5), JSON.stringify(on('a').data['rows']));

  await ask('How many greetings are there?');
  check('"How many greetings are there?" is one number: 5', await until(() => on('a').action === 'rows.stat' && value('a') === 5), JSON.stringify(on('a').data));

  await ask('Greetings per language');
  check('"Greetings per language" is bars, one for each of the five languages', await until(() => on('a').action === 'rows.bars' && rows('a', 'items').length === 5), JSON.stringify(on('a').data['items']));

  await ask('Which greetings are in German?');
  check('"Which greetings are in German?" reads the greetings in German alone', await until(() => on('a').action === 'rows.table' && rows('a', 'rows').length === 1), JSON.stringify(on('a').data['params']));

  await ask('Everything about the greetings');
  check('the model ordering the same answers otherwise moves nothing: what the picker placed stays where it is', areas() === 'rows.table rows.stat rows.bars', areas());
  check('an arrangement picked without room for the answers gives way to the smallest that has it', current().arrangement === 'trio' && grid() === '3: a b c', `${String(current().arrangement)} — ${grid()}`);

  await ask('Greetings and languages side by side');
  check('an arrangement the picker chose for the message is the one the answer is laid out in', current().arrangement === 'pair' && grid() === '2: a b', `${String(current().arrangement)} — ${grid()}`);

  await ask('The count and the languages, with the table wide beneath');
  check('a layout the model wrote is the one the answer is laid out in', current().arrangement === 'written' && grid() === '2: a b c×2' && areas() === 'rows.stat rows.bars rows.table', `${String(current().arrangement)} — ${grid()} — ${areas()}`);

  await ask('The count and the table, laid out by hand');
  check('a layout the model wrote that is not a grid of areas is refused, and an arrangement that fits stands', current().arrangement === 'pair' && grid() === '2: a b', `${String(current().arrangement)} — ${grid()}`);

  await ask('Add a greeting that says Servus');
  const fields = (canvas: string): { key: string; value: string }[] => rows(canvas, 'fields') as { key: string; value: string }[];
  check('"Add a greeting that says Servus" opens the form, and the model fills it in where it stands', await until(() => on('a').action === 'rows.form' && fields('a')[0]?.value === 'Servus' && fields('a')[1]?.value === 'German'), JSON.stringify(fields('a')));
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
  check('a screen from the menu shows its answers in its arrangement, and the menu marks it', await until(() => current().screen === 'languages' && areas() === actionsOf(languages?.answers ?? []) && current().arrangement === languages?.arrangement), `${areas()} — ${grid()}`);
  const stacked = total();
  const languagesAt = Number(current().position);
  session.dispatch('bar', { type: 'ui:click', ref: 'screen', payload: 'overview' });
  check('a screen already in the stack is gone back to, not stacked again', await until(() => current().screen === 'overview' && current().position === 1 && total() === stacked), `${String(current().position)} of ${total()}`);
  session.dispatch('bar', { type: 'ui:click', ref: 'screen', payload: 'languages' });
  check('and the other screen, at its own place', await until(() => current().screen === 'languages' && Number(current().position) === languagesAt && total() === stacked), `${String(current().position)} of ${total()}`);

  await ask('What can you do?');
  check('a question about the app itself is answered in a few words, with things to ask', on('a').action === 'answer.text' && on('a').data['title'] === 'What this app shows' && rows('a', 'examples').length === ANSWERS.length && areas() === 'answer.text', areas());

  await ask('Show the overview');
  check('a screen is chosen like any answer, and shown with its own words', areas() === OVERVIEW, areas());

  await ask('show overview + app overview');
  check('the model can answer with a screen and words of its own: the words, then the screen without its own', areas() === `answer.text ${OVERVIEW_UNSAID}` && on('a').data['title'] === 'What this app is', areas());

  await ask('What is the weather in Vienna?');
  check('a message nothing answers is a line saying so above the first screen', on('a').action === 'answer.text' && on('a').data['title'] === 'Nothing here answers that yet' && areas() === `answer.text ${OVERVIEW_UNSAID}`, areas());

  const weather = Number(current().position);
  await ask('how many are there');
  check('a message the picker is sure of nothing about, and the model answers, is the model’s answer — one answer, no notice before it', on('a').action === 'rows.stat' && Number(current().position) === weather + 1, `${areas()}, position ${String(current().position)} after ${weather}`);

  session.dispatch('bar', { type: 'ui:click', ref: 'back' });
  check('back is the answer before, as it was', await until(() => Number(current().position) === weather && on('a').data['title'] === 'Nothing here answers that yet'), `position ${String(current().position)}, ${areas()}`);
  session.dispatch('bar', { type: 'ui:click', ref: 'forward' });
  check('forward is the count again', await until(() => Number(current().position) === weather + 1 && on('a').action === 'rows.stat'), `position ${String(current().position)}, ${areas()}`);

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
  check('with no key, a message is answered with a line naming the key, above the first screen', await until(() => String(first()['text'] ?? '').includes('GROQ_API_KEY')), JSON.stringify(first()));
} finally {
  keyless.close();
}

console.log(failures === 0 ? '[pass] compose: all checks passed' : `[fail] compose: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
