import { GUIDE } from '../app/actions/guide/guide.actions';
import { SCREENS } from '../app/screens';
import { recordOf } from '../server/compose/record';
import { checks } from './checks';
import { scriptedModels, settle, startApp, until } from './scripted';
import type { Script, Shown } from './scripted';

const SCRIPT: Script = {
  'What is the charter?': [{ response: 'The charter says who may do what.', cards: [{ action: 'guide.charter', input: {} }] }],
  'A counter that starts at 100': [{ cards: [{ action: 'guide.counter', input: { title: 'From 100', count: 100 } }] }],
  'A counter at 5, no title': [{ cards: [{ action: 'guide.counter', input: { title: null, count: 5 } }] }],
  'A checklist with no steps': [{ cards: [{ action: 'guide.checklist', input: { title: 'Empty', todo: [] } }] }, { cards: [{ action: 'guide.checklist', input: { title: 'Mine', todo: ['One step'] } }] }],
};

const { check, finish } = checks('guide');

const nowhere = GUIDE.flatMap((action) => (Array.isArray(action.data?.['links']) ? action.data['links'] : []).map((link: unknown) => recordOf(link)['screen'])).filter((screen) => !SCREENS.some((one) => one.id === screen));
check('every link on a card opens a screen there is', nowhere.length === 0, nowhere.join(', '));

const scripted = scriptedModels(SCRIPT);
const { prompts } = scripted;
const app = await startApp(scripted.models);
const { on, ask, session } = app;
const card = (canvas: 'screen' | 'talk', action: string): Shown | undefined => [...on(canvas)].reverse().find((one) => one.action === action);
const press = (canvas: 'screen' | 'talk', shown: Shown | undefined, event: Record<string, unknown>): void => session.dispatch(canvas, { ...event, origin: shown?.id ?? '' });
const rows = (shown: Shown | undefined, key: string): unknown[] => {
  const value = shown?.data[key];
  return Array.isArray(value) ? value : [];
};
try {
  app.drawn();
  press('screen', card('screen', 'guide.counter'), { type: 'ui:click', ref: 'up' });
  press('screen', card('screen', 'guide.counter'), { type: 'ui:click', ref: 'up' });
  press('screen', card('screen', 'guide.counter'), { type: 'ui:click', ref: 'down' });
  press('screen', card('screen', 'guide.counter'), { type: 'ui:click', ref: 'up' });
  check('the counter counts what is pressed, up and down', await until(() => card('screen', 'guide.counter')?.data['count'] === 2), JSON.stringify(card('screen', 'guide.counter')?.data));
  press('screen', card('screen', 'guide.quiz'), { type: 'ui:click', ref: 'pick', payload: 1 });
  check('the quick check, picked right, says so and why', await until(() => app.drawn().includes('Right. Links act at once')), JSON.stringify(card('screen', 'guide.quiz')?.data));
  press('screen', card('screen', 'guide.checklist'), { type: 'ui:click', ref: 'tick', payload: 0 });
  check('a step ticked off moves from the steps to do to the ones done', await until(() => rows(card('screen', 'guide.checklist'), 'done').join() === 'Press the counter'), JSON.stringify(card('screen', 'guide.checklist')?.data));

  await ask('What is the charter?');
  const charter = card('talk', 'guide.charter');
  check('a card the model shows goes under its turn, with its own text', charter !== undefined && charter.data['title'] === 'The charter' && String(charter.data['example']).includes('"public"'), JSON.stringify(charter?.data).slice(0, 200));
  check('the screen behind keeps what the person did to it', card('screen', 'guide.counter')?.data['count'] === 2 && rows(card('screen', 'guide.checklist'), 'done').length === 1, JSON.stringify(card('screen', 'guide.counter')?.data));

  const link = recordOf(rows(charter, 'links')[0]);
  const promptsBeforeLink = prompts.length;
  press('talk', charter, { type: 'ui:click', ref: 'link', payload: link['screen'] });
  const linked = SCREENS.find((screen) => screen.id === link['screen']);
  check(
    'a link on a card in the conversation opens its screen at once, and asks nothing of the model',
    (await until(() => on('screen').map((one) => one.action).join(' ') === linked?.cards.map((one) => one.action).join(' '))) && prompts.length === promptsBeforeLink,
    on('screen').map((one) => one.action).join(' '),
  );
  await settle();

  await app.openScreen('rules');
  check(
    'the packages card replays its read: every row of the table, in order, worded by the read’s mapping',
    (await until(() => rows(card('screen', 'guide.packages'), 'points').length === 12)) && JSON.stringify(rows(card('screen', 'guide.packages'), 'points')[0]) === JSON.stringify({ title: '@niscorp/nova', text: 'The screen: shells, canvases, actions and their layouts.' }),
    JSON.stringify(card('screen', 'guide.packages')?.data).slice(0, 300),
  );

  await ask('A counter that starts at 100');
  check('a card the model fills in is opened with what it was given', card('talk', 'guide.counter')?.data['count'] === 100 && card('talk', 'guide.counter')?.data['title'] === 'From 100', JSON.stringify(card('talk', 'guide.counter')?.data));
  const counter = card('talk', 'guide.counter');
  press('talk', counter, { type: 'ui:click', ref: 'reset' });
  check('a card in the conversation works as it does on a screen', await until(() => on('talk').find((one) => one.id === counter?.id)?.data['count'] === 0), JSON.stringify(on('talk').find((one) => one.id === counter?.id)?.data));
  await ask('A counter at 5, no title');
  check('a value the model says is null is its card’s default', card('talk', 'guide.counter')?.data['count'] === 5 && card('talk', 'guide.counter')?.data['title'] === 'Press me', JSON.stringify(card('talk', 'guide.counter')?.data));
  prompts.length = 0;
  await ask('A checklist with no steps');
  check('a checklist with no steps is sent back saying so', (prompts[1] ?? '').includes('input.todo') && card('talk', 'guide.checklist')?.data['title'] === 'Mine', prompts[1]?.slice(-300) ?? '');
} finally {
  app.server.close();
}

finish();
