import { renderDocument } from '@niscorp/moss';
import { placeable } from '../app/action-catalog';
import { SCREENS } from '../app/screens';
import { drawing } from '../server/document';
import { checks } from './checks';
import { scriptedModels, settle, startApp, until } from './scripted';
import type { Script, Shown } from './scripted';

const [FIRST] = SCREENS;
const LAST = SCREENS[SCREENS.length - 1] ?? FIRST;
// One of the app's own cards, if it has any: what the model shows is checked with it.
const [ONE] = placeable;

const say = (title: string, text = `About ${title}.`) => ({ say: { title, text } });

const SCRIPT: Script = {
  'What can you do?': [{ response: 'I answer with this app’s cards.', cards: [say('What this app does', 'It answers with cards.')] }],
  'and then?': [{ response: 'Then you ask again.', cards: [] }],
  'Show me the weather card': [{ cards: [{ action: 'weather.card', input: {} }] }, { response: 'There is no weather here.', cards: [say('No weather')] }],
  'Words and a card at once': [{ cards: [{ action: 'weather.card', input: {}, say: { title: 'Both', text: 'Both.' } }] }, { cards: [say('One of them')] }],
  'Never a card that is there': [{ cards: [{ action: 'weather.card', input: {} }] }],
  'Too many cards': [{ cards: [say('One'), say('Two'), say('Three'), say('Four')] }],
  'One of your cards': [{ response: 'Here it is.', cards: [{ action: ONE?.id ?? 'answer.text', input: {} }] }],
};

const { check, finish } = checks('compose');
const actionsOf = (shown: Shown[]): string => shown.map((one) => one.action).join(' ');
const scripted = scriptedModels(SCRIPT);
const { prompts } = scripted;
const lastPrompt = (): string => prompts[prompts.length - 1] ?? '';
const app = await startApp(scripted.models);
const { on, said, runs, ask, session } = app;
try {
  const template = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
  const page = await renderDocument({ ...drawing, server: app.server, template, request: { path: '/', cookie: null } });
  check('the page arrives drawn: the first screen, and the dock with the line to ask in', page.drawn && ['k-frame', 'k-dock', 'k-prompt'].every((part) => page.html.includes(part)), page.html.slice(0, 300));

  const START = FIRST.cards.map((card) => card.action).join(' ');
  check('the app opens on the first screen, its cards in order, and the conversation empty', actionsOf(on('screen')) === START && on('talk').length === 0, actionsOf(on('screen')));
  const screenIds = on('screen').map((one) => one.id).join();

  await ask('What can you do?');
  const talk = on('talk');
  check(
    'a message is answered with a turn: what was asked and the sentence, then its cards — words as the words card',
    actionsOf(talk) === 'answer.turn answer.text' && talk[0]?.data['question'] === 'What can you do?' && talk[0]?.data['reply'] === 'I answer with this app’s cards.' && talk[1]?.data['title'] === 'What this app does',
    JSON.stringify(talk.map((one) => one.data)),
  );
  check('the screen behind the conversation stays as it was', on('screen').map((one) => one.id).join() === screenIds, actionsOf(on('screen')));
  check(
    'the model is told the cards the person may be shown, and the message, with nothing said before it',
    lastPrompt().includes('CONVERSATION SO FAR\nnothing yet') && lastPrompt().includes('MESSAGE: What can you do?') && prompts.some((prompt) => prompt.includes('CARDS — what each shows')),
    lastPrompt().slice(-400),
  );
  check(
    'each message is recorded as a run: the model, what it spent and how it ended',
    runs.map((run) => `${run.agentId} ${run.model} ${run.outcome} ${run.steps} ${run.totalTokens}`).join(' | ') === 'nisc-template-app.compose chat ok 1 110',
    JSON.stringify(runs),
  );

  await ask('and then?');
  check(
    'a message that follows on is told the conversation so far: what was asked, said and shown',
    lastPrompt().includes('they asked: "What can you do?" — you said: "I answer with this app’s cards." — shown: words') && on('talk').length === 3,
    lastPrompt().slice(-400),
  );
  check('a turn with no cards is the turn alone', on('talk').at(-1)?.action === 'answer.turn' && on('talk').at(-1)?.data['reply'] === 'Then you ask again.', actionsOf(on('talk')));

  prompts.length = 0;
  await ask('Show me the weather card');
  check('a card the app does not have is sent back saying so, and the corrected answer is shown', (prompts[1] ?? '').includes('there is no card "weather.card"') && on('talk').at(-1)?.data['title'] === 'No weather', prompts[1]?.slice(-300) ?? '');
  prompts.length = 0;
  await ask('Words and a card at once');
  check('a card that is both words and a card is sent back saying so', (prompts[1] ?? '').includes('give exactly one of "action" with "input", or "say"') && on('talk').at(-1)?.data['title'] === 'One of them', prompts[1]?.slice(-300) ?? '');

  prompts.length = 0;
  runs.length = 0;
  const before = on('talk').length;
  await ask('Never a card that is there');
  check(
    'an answer refused every time is a turn that says so, and the screen stays as it was',
    prompts.length === 5 && on('talk').length === before + 1 && String(on('talk').at(-1)?.data['reply']).includes('could not answer') && on('screen').map((one) => one.id).join() === screenIds,
    `${String(prompts.length)} tries — ${String(on('talk').at(-1)?.data['reply'])}`,
  );
  check('its run is recorded as failed, with every try', runs[0]?.outcome === 'failed' && runs[0]?.steps === 5, JSON.stringify(runs[0]));

  await ask('Too many cards');
  check('more cards than a turn may have is refused, and the turn says so', String(on('talk').at(-1)?.data['reply']).includes('could not answer'), String(on('talk').at(-1)?.data['reply']));

  scripted.unreachable(true);
  runs.length = 0;
  await ask('and then?');
  check('a model that cannot be reached is a turn that says so', String(on('talk').at(-1)?.data['reply']).includes('could not be reached') && said() === '', String(on('talk').at(-1)?.data['reply']));
  check('and its run is recorded as failed: one step, nothing spent', runs[0]?.outcome === 'failed' && runs[0]?.steps === 1 && runs[0]?.totalTokens === 0, JSON.stringify(runs[0]));
  scripted.unreachable(false);

  if (ONE !== undefined) {
    await ask('One of your cards');
    const shown = on('talk').at(-1);
    check('one of the app’s cards the model shows goes under its turn, opened with its whole input', shown?.action === ONE.id && Object.keys(ONE.data ?? {}).every((key) => shown.data[key] !== undefined), JSON.stringify(shown));
  }

  const turns = on('talk').length;
  session.shell.back();
  await settle();
  check('a turn is never a step Back takes', on('talk').length === turns, String(on('talk').length));

  const asked = prompts.length;
  session.shell.publish('ask', 'What can you do?');
  check('a message sent on `ask` — a card’s thing to ask — is asked as if typed', (await until(() => prompts.length > asked)) && lastPrompt().includes('MESSAGE: What can you do?'), lastPrompt().slice(-200));
  await settle();

  const turnsBefore = on('talk').filter((one) => one.action === 'answer.turn').length;
  session.shell.publish('ask', 'What can you do?');
  session.shell.publish('ask', 'and then?');
  const both = await until(() => on('talk').filter((one) => one.action === 'answer.turn' && one.data['thinking'] === false).length === turnsBefore + 2);
  const lastTwo = on('talk').filter((one) => one.action === 'answer.turn').slice(-2);
  check(
    'two messages sent at once are both answered, one after the other, in the order they were sent',
    both && lastTwo.map((one) => one.data['question']).join(' | ') === 'What can you do? | and then?' && lastPrompt().includes('they asked: "What can you do?"'),
    JSON.stringify(lastTwo.map((one) => one.data)),
  );
  await settle();

  const promptsBeforeOpen = prompts.length;
  await app.openScreen(LAST.id);
  check('a screen opened from the dock is its cards, in order, and asks nothing of the model', actionsOf(on('screen')) === LAST.cards.map((card) => card.action).join(' ') && prompts.length === promptsBeforeOpen, actionsOf(on('screen')));
  session.shell.publish('open', FIRST.id);
  check('a screen asked for on `open` — a card’s link — is shown at once', await until(() => actionsOf(on('screen')) === START), actionsOf(on('screen')));
} finally {
  app.server.close();
}

const keyless = await startApp(scriptedModels(SCRIPT, { keyless: true }).models);
try {
  await keyless.ask('What can you do?');
  check('with no key, the turn names the key to set', String(keyless.on('talk').at(-1)?.data['reply']).includes('GROQ_API_KEY'), JSON.stringify(keyless.on('talk').map((one) => one.data)));
} finally {
  keyless.server.close();
}

finish();
