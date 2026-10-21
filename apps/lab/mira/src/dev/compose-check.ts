import { renderDocument } from '@niscorp/moss';
import { ARRANGEMENTS } from '../app/arrangements';
import { SCREENS } from '../app/screens';
import { AREAS } from '../app/shell/areas';
import { recordOf } from '../server/compose/record';
import { drawing } from '../server/document';
import { checks } from './checks';
import { scriptedModels, settle, startApp, until } from './scripted';
import type { Script } from './scripted';

const [FIRST] = SCREENS;

const keep = (area: string, from = area) => ({ area, keep: from });
const say = (area: string, title: string, text = `About ${title}.`) => ({ area, say: { title, text } });
const gridOf = (columns: number, ...areas: [string, number][]): unknown => ({ columns, areas: areas.map(([name, span]) => ({ name, span })) });

const SCRIPT: Script = {
  'Two things side by side': [{ response: 'Put the two side by side.', title: 'Two things', areas: [say('a', 'One'), say('b', 'Two')], arrangement: 'pair' }],
  'drop the second': [{ title: 'One thing', areas: [{ area: 'b', drop: true }] }],
  'the second again, beside it': [{ title: 'Second again', areas: [keep('a'), say('b', 'Two')] }],
  'swap them': [{ title: 'Swapped', areas: [keep('a', 'b'), keep('b', 'a')] }],
  'other words for the first': [{ title: 'Said again', areas: [say('b', 'One', 'Said again.')] }],
  'keep what is not there': [{ areas: [keep('a', 'f'), say('c', 'Three')] }, { areas: [keep('a')] }],
  'Show me the weather card': [{ areas: [{ area: 'a', action: 'weather.card', input: {}, intent: 'the weather' }] }],
  'Three things, the last wide beneath': [{ title: 'Three things', areas: [say('a', 'One'), say('b', 'Two'), say('c', 'Three')], grid: gridOf(2, ['a', 1], ['b', 1], ['c', 2]) }],
  'Two things, in a grid of my own': [
    { areas: [say('a', 'One'), say('b', 'Two'), { area: 'c', drop: true }], grid: gridOf(2, ['a', 1], ['a', 1]) },
    { title: 'Two again', areas: [say('a', 'One'), say('b', 'Two'), { area: 'c', drop: true }] },
  ],
  'What can you do?': [{ title: 'What it does', areas: [say('a', 'What this app does', 'It answers with screens.')], arrangement: 'single' }],
  'Show the first screen': [{ screen: FIRST.id }],
  'What is the weather in Vienna?': [{ response: 'Nothing in this app shows the weather.', areas: [] }],
  'Name it at length': [{ title: 'A title that runs on well past the forty characters a title may have', areas: [] }],
  'Only one thing': [{ areas: [say('a', 'One')], arrangement: 'single' }],
};

const { check, finish } = checks('compose');
const START = FIRST.canvases.map((canvas) => canvas.action).join(' ');
const opened = AREAS.slice(0, FIRST.canvases.length);

const scripted = scriptedModels(SCRIPT);
const { prompts } = scripted;
const lastPrompt = (): string => prompts[prompts.length - 1] ?? '';
const app = await startApp(scripted.models);
const { on, current, total, grid, areas, ids, without, said, drawn, marked, runs, ask, session } = app;
try {
  const template = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
  const page = await renderDocument({ ...drawing, server: app.server, template, request: { path: '/', cookie: null } });
  check('the page arrives drawn: the first screen, and the dock with the screens and the line to ask in', page.drawn && ['k-frame', 'k-dock', 'k-prompt'].every((part) => page.html.includes(part)), page.html.slice(0, 300));

  check('the app opens on the first screen, every one of its canvases an area of its own, and the stack starts there', areas() === START && on('dock').action === 'ask.dock' && current().position === 1 && total() === 1, areas());
  const room = ARRANGEMENTS.find((arrangement) => arrangement.id === FIRST.arrangement)?.areaCount;
  check('the frame’s region holds the first screen’s arrangement', current().arrangement === FIRST.arrangement && grid().split(' ').length - 1 === room, `${String(current().arrangement)} — ${grid()}`);

  runs.length = 0;
  scripted.likely([FIRST.id]);
  await ask('Two things side by side');
  scripted.likely([]);
  const jev = scripted.asked[scripted.asked.length - 1];
  check(
    'each message is recorded as two runs: Jev\'s pass and the model\'s, each with its model, what it spent and how it ended',
    runs.map((run) => `${run.agentId} ${run.model} ${run.outcome} ${run.steps} ${run.totalTokens} ${run.label}`).join(' | ') === 'mira.jev jev ok 1 110 Two things side by side | mira.compose chat ok 1 110 Two things side by side',
    JSON.stringify(runs),
  );
  check('Jev is asked about the message with the open screen: an intent for each canvas', jev?.state['message'] === 'Two things side by side' && Object.keys(recordOf(jev?.state['open_screen'])).join() === opened.join(), JSON.stringify(jev?.state['open_screen']));
  check(
    'the model is given the open screen by area — where each area is, what each holds — and what Jev thinks',
    prompts[0]?.includes(`arrangement ${FIRST.arrangement}: `) === true && prompts[0].includes(`- a: ${FIRST.canvases[0]?.action ?? ''}`) && prompts[0].includes(`A FAST PICKER THINKS (a hint; how likely each belongs in the answer): actions none; reads none; writes none; screens ${FIRST.id} 0.90`),
    prompts[0]?.slice(0, 600) ?? '',
  );
  check('words the model says are placed where it says, in the room it gives', areas() === 'answer.text answer.text' && on('a').data['title'] === 'One' && on('b').data['title'] === 'Two' && grid() === '2: a b', `${areas()} — ${grid()}`);
  check('the areas the answer changed are outlined', marked() === 'a b', marked());
  check('the chip in the dock names the answer shown by its title, and where it stands among the answers', drawn().includes('"Two things · 2/2"'), drawn().match(/"label":"[^"]*· \d+\/\d+"/)?.[0] ?? '');
  session.dispatch('dock', { type: 'ui:click', ref: 'stack' });
  await settle();
  check(
    'opening the chip shows what was asked, what the model said it did, and the answers to go back to',
    current().response === 'Put the two side by side.' && drawn().includes('side by side.') && drawn().includes(`1. ${FIRST.label}`) && drawn().includes('2. Two things') && drawn().includes('Two things side by side'),
    String(current().response),
  );
  session.dispatch('dock', { type: 'ui:click', ref: 'stack' });

  const pairIds = ids();
  await ask('drop the second');
  check('when Jev finds nothing likely, the model is given no hint', !lastPrompt().includes('FAST PICKER'), lastPrompt().slice(-300));
  check('an answer that only empties an area outlines nothing', marked() === '', marked());
  check('an area the model drops is emptied, and every other stays as it was', on('b').id === '' && without('b', ids()) === without('b', pairIds), `${ids()} vs ${pairIds}`);
  const first = on('a').id;
  await ask('the second again, beside it');
  check('a canvas kept stays the same canvas, in its area; what is new goes where the model puts it', on('a').id === first && on('b').data['title'] === 'Two', `${ids()}`);
  await ask('swap them');
  check('the answer streams in: an area is placed while the rest of the reply is still being written', app.streamed() > 0, String(app.streamed()));
  check('a canvas the model keeps from another area moves there', on('a').data['title'] === 'Two' && on('b').data['title'] === 'One', `${String(on('a').data['title'])} ${String(on('b').data['title'])}`);
  const inB = on('b').id;
  await ask('other words for the first');
  check('a canvas the model writes again keeps its place and its instance, and takes what it is given', on('b').id === inB && on('b').data['text'] === 'Said again.', JSON.stringify(on('b').data));

  prompts.length = 0;
  await ask('keep what is not there');
  check(
    'keeping an area that is empty, or using one the arrangement does not have, is sent back saying so',
    (prompts[1] ?? '').includes('there is nothing in area f to keep') && (prompts[1] ?? '').includes('has no area c'),
    prompts[1]?.slice(-400) ?? '',
  );

  const beforeWeatherCard = ids();
  const stackBeforeWeatherCard = total();
  prompts.length = 0;
  runs.length = 0;
  await ask('Show me the weather card');
  check(
    'an answer refused three times leaves the screen as it was, and the line says so',
    prompts.length === 3 && prompts[1]?.includes('there is no action "weather.card"') === true && ids() === beforeWeatherCard && total() === stackBeforeWeatherCard && said().includes('did not fit'),
    `${ids()} — ${said()}`,
  );
  check('a model run refused three times is recorded as failed, with its three steps', runs[1]?.outcome === 'failed' && runs[1]?.steps === 3 && runs[1]?.totalTokens === 330, JSON.stringify(runs[1]));

  await ask('Three things, the last wide beneath');
  check('a layout the model wrote is the one the answer is laid out in', current().arrangement === 'written' && grid() === '2: a b c×2' && areas() === 'answer.text answer.text answer.text', `${String(current().arrangement)} — ${grid()} — ${areas()}`);
  prompts.length = 0;
  await ask('Two things, in a grid of my own');
  check('a grid that names an area twice is sent back saying so, and the arrangement on screen stays', (prompts[1] ?? '').includes('the grid names an area twice') && current().arrangement === 'written' && areas() === 'answer.text answer.text', `${String(current().arrangement)} — ${areas()}`);

  const stacked = total();
  const promptsBeforeOpen = prompts.length;
  session.shell.publish('open', FIRST.id);
  check(
    'a screen asked for on `open` — a card’s link — is shown at once, gone back to where it is in the stack, and nothing is asked of the model',
    (await until(() => current().screen === FIRST.id)) && areas() === START && current().position === 1 && total() === stacked && prompts.length === promptsBeforeOpen,
    `${areas()} — ${String(current().position)} of ${total()}`,
  );
  await settle();

  const answeredBefore = app.answered();
  session.shell.publish('ask', 'What can you do?');
  check('a message sent on `ask` — a card’s thing to ask — is asked as if typed', (await until(() => app.answered() > answeredBefore)) && lastPrompt().includes('MESSAGE: What can you do?'), lastPrompt().slice(-200));
  await settle();
  check('words the model says are shown as words', areas() === 'answer.text' && on('a').data['title'] === 'What this app does', areas());

  await ask('Show the first screen');
  check('the model can answer with one of the app’s screens: gone back to where it is in the stack', current().screen === FIRST.id && current().position === 1, `${String(current().position)} of ${total()}`);

  const beforeWeather = ids();
  const stackBeforeWeather = total();
  await ask('What is the weather in Vienna?');
  check('an answer that changes nothing leaves the screen as it was, and adds nothing to the stack', ids() === beforeWeather && total() === stackBeforeWeather && said() === '', `${ids()} — ${String(total())} — ${said()}`);
  check('and the bar says what was asked, and why nothing changed', current().question === 'What is the weather in Vienna?' && current().response === 'Nothing in this app shows the weather.', JSON.stringify(current()).slice(0, 200));

  scripted.unreachable(true);
  runs.length = 0;
  await ask('Only one thing');
  check('a model that cannot be reached leaves the screen as it was, and the line says so', ids() === beforeWeather && said().includes('could not be reached'), said());
  check('and its run is recorded as failed: one step, nothing spent', runs[1]?.agentId === 'mira.compose' && runs[1]?.outcome === 'failed' && runs[1]?.steps === 1 && runs[1]?.totalTokens === 0, JSON.stringify(runs[1]));
  scripted.unreachable(false);

  runs.length = 0;
  await ask('Name it at length');
  check('a reply that does not fit the reply’s schema is refused: the screen stays, and the line says it did not fit', ids() === beforeWeather && said().includes('did not fit'), said());
  check('and its run is recorded as failed, with its three steps', runs[1]?.outcome === 'failed' && runs[1]?.steps === 3, JSON.stringify(runs[1]));

  session.dispatch('dock', { type: 'ui:click', ref: 'forward' });
  check('forward from the first screen is the answer after it, as it was', await until(() => current().position === 2 && current().question === 'Two things side by side' && on('a').data['title'] === 'One'), `position ${String(current().position)}, ${areas()}`);
  session.dispatch('dock', { type: 'ui:click', ref: 'back' });
  check('back is the first screen again', await until(() => current().position === 1 && current().screen === FIRST.id), `position ${String(current().position)}`);

  session.dispatch('dock', { type: 'ui:click', ref: 'stack' });
  const stack = current().stack ?? [];
  check('the chip opens the stack: every answer, by its title or the screen it is', on('dock').data['listing'] === true && stack.length === total() && stack[0]?.label === FIRST.label && stack[1]?.label === 'Two things', JSON.stringify(stack.slice(0, 3)));
  session.dispatch('dock', { type: 'ui:click', ref: 'entry', payload: 4 });
  check('an answer picked from the stack is shown as it was, and the list closes', await until(() => current().position === 4 && on('b').data['title'] === 'Two' && on('dock').data['listing'] === false), `${String(current().position)}, ${areas()}`);
} finally {
  app.server.close();
}

const jevless = await startApp(scriptedModels(SCRIPT, { jevFails: true }).models);
try {
  await jevless.ask('Only one thing');
  check('when Jev cannot answer, the model answers alone', jevless.areas() === 'answer.text' && jevless.on('a').data['title'] === 'One', jevless.areas());
} finally {
  jevless.server.close();
}

const keyless = await startApp(scriptedModels(SCRIPT, { keyless: true }).models);
try {
  await keyless.ask('Only one thing');
  check('with no key, the line names the key, and the screen stays as it was', keyless.said().includes('GROQ_API_KEY'), keyless.said());
} finally {
  keyless.server.close();
}

finish();
