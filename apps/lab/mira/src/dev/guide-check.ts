import { checks, recordOf, settle, startApp, until } from './scripted';
import type { Script } from './scripted';

// The tour of nisc the app starts with: its cards pressed, ticked and picked, its links, and what the model sees of
// them and changes. Deleted with src/app/actions/guide/.
const card = (action: string) => ({ action, input: {}, intent: action });
const counter = (title: string, count: number) => ({ action: 'guide.counter', input: { title, count }, intent: 'a counter' });
const checklist = (title: string, todo: string[]) => ({ action: 'guide.checklist', input: { title, todo }, intent: 'a checklist' });

const SCRIPT: Script = {
  'What is the charter?': [{ response: 'Put the charter where the nisc card was; the rest stays.', title: 'The charter', areas: [{ area: 'e', ...card('guide.charter') }] }],
  'A counter that starts at 100': [{ areas: [{ area: 'b', ...counter('From 100', 100) }] }],
  'A checklist with no steps': [{ areas: [{ area: 'd', ...checklist('Empty', []) }] }, { areas: [{ area: 'd', ...checklist('Mine', ['One step']) }] }],
  'the nisc card at the top too': [{ areas: [{ area: 'a', ...card('guide.nisc') }] }, { areas: [] }],
};

const { check, finish } = checks('guide');
const app = await startApp(SCRIPT);
const { on, rows, ids, without, current, drawn, areas, prompts, lastPrompt, ask, session } = app;
try {
  app.draw();
  session.dispatch('b', { type: 'ui:click', ref: 'up' });
  session.dispatch('b', { type: 'ui:click', ref: 'up' });
  session.dispatch('b', { type: 'ui:click', ref: 'down' });
  session.dispatch('b', { type: 'ui:click', ref: 'up' });
  check('the counter counts what is pressed, up and down', await until(() => on('b').data['count'] === 2), JSON.stringify(on('b').data));
  session.dispatch('c', { type: 'ui:click', ref: 'pick', payload: 1 });
  check('the quick check, picked right, says so and why', await until(() => drawn().includes('Right. Links and buttons act at once')), JSON.stringify(on('c').data));
  session.dispatch('d', { type: 'ui:click', ref: 'tick', payload: 0 });
  check('a step ticked off moves from the steps to do to the ones done', await until(() => rows('d', 'done').join() === 'Press the counter' && rows('d', 'todo').length === 4), JSON.stringify(on('d').data));
  app.draw();
  session.dispatch('d', { type: 'ui:model', ref: 'adding', payload: 'Read the charter' });
  session.dispatch('d', { type: 'ui:click', ref: 'add' });
  check('a step typed and added goes last among the steps to do, and the line empties', await until(() => rows('d', 'todo').at(-1) === 'Read the charter' && on('d').data['adding'] === ''), JSON.stringify(on('d').data));

  const startIds = ids();
  await ask('What is the charter?');
  check(
    'the model is given each card as the person left it: the count pressed, the steps ticked and added, the pick made',
    lastPrompt().includes('input {"title":"Press me","count":2}') && lastPrompt().includes('"done":["Press the counter"]') && lastPrompt().includes('"Ask the model to change a card","Read the charter"]') && lastPrompt().includes('"picked":1}'),
    lastPrompt().slice(0, 1600),
  );
  check('a card the model puts on the screen goes where it says, and nothing else moves', without('e', ids()) === without('e', startIds) && on('e').action === 'guide.charter', `${ids()} vs ${startIds}`);
  check('a card the answer leaves alone keeps what the person did to it', on('b').data['count'] === 2 && rows('d', 'done').length === 1 && on('c').data['picked'] === 1, JSON.stringify(on('b').data));
  check('a guide card holds its own text: its lead, its example, and where it leads', on('e').data['title'] === 'The charter' && String(on('e').data['example']).includes('"public"') && rows('e', 'links').length === 1, JSON.stringify(on('e').data).slice(0, 200));

  const link = recordOf(rows('e', 'links')[0]);
  const promptsBeforeLink = prompts.length;
  session.dispatch('e', { type: 'ui:click', ref: 'link', payload: link['screen'] });
  check(
    'a card’s link opens its screen at once, and asks nothing of the model',
    (await until(() => current().screen === link['screen'])) && prompts.length === promptsBeforeLink && areas() === 'guide.yours guide.checklist',
    `${String(current().screen)} — ${areas()}`,
  );
  await settle();
  await app.openScreen('start');
  check('a screen gone back to is as the person left it', on('b').data['count'] === 2 && rows('d', 'done').join() === 'Press the counter' && on('c').data['picked'] === 1, `${JSON.stringify(on('b').data)} ${JSON.stringify(on('d').data)}`);
  await app.openScreen('asking');
  check('another quick check where an answered one was opens unanswered', on('c').action === 'guide.quiz' && on('c').data['picked'] === -1, JSON.stringify(on('c').data));
  await app.openScreen('start');

  const counterId = on('b').id;
  await ask('A counter that starts at 100');
  check('a card the model opens again with another input keeps its place and its instance, and takes the input', on('b').id === counterId && on('b').data['count'] === 100 && on('b').data['title'] === 'From 100', JSON.stringify(on('b').data));
  session.dispatch('b', { type: 'ui:click', ref: 'reset' });
  check('Reset sets the counter back to zero, whatever it was opened with', await until(() => on('b').data['count'] === 0), JSON.stringify(on('b').data));
  prompts.length = 0;
  await ask('A checklist with no steps');
  check('a checklist with no steps is sent back saying so', (prompts[1] ?? '').includes('input.todo') && on('d').data['title'] === 'Mine', prompts[1]?.slice(-300) ?? '');
  check('a checklist the model writes where another was keeps none of its ticks', rows('d', 'done').length === 0 && rows('d', 'todo').join() === 'One step', JSON.stringify(on('d').data));
  prompts.length = 0;
  await ask('the nisc card at the top too');
  check('the same card in two areas is sent back saying so', (prompts[1] ?? '').includes('areas a and e would show the same thing; show it once'), prompts[1]?.slice(-300) ?? '');
} finally {
  app.server.close();
}

finish();
