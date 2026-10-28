import { renderDocument } from '@niscorp/moss';
import { SCREENS } from '../app/screens';
import { recordOf } from '../server/compose/record';
import { drawing } from '../server/document';
import { checks } from './checks';
import { OWNER, scriptedModels, settle, startApp, until } from './scripted';
import type { Script } from './scripted';

const [FIRST] = SCREENS;

const keep = (title: string) => ({ keep: title });
const say = (title: string, text = `About ${title}.`) => ({ say: { title, text } });

const SCRIPT: Script = {
  'Two things side by side': [{ response: 'Put the two side by side.', title: 'Two things', columns: 2, cards: [say('One'), say('Two')] }],
  'drop the second': [{ title: 'One thing', cards: [keep('One')] }],
  'the second again, beside it': [{ title: 'Second again', cards: [keep('One'), say('Two')] }],
  'swap them': [{ title: 'Swapped', cards: [keep('Two'), keep('One')] }],
  'other words for the first': [{ title: 'Said again', cards: [keep('Two'), say('One', 'Said again.')] }],
  'keep what is not there': [{ cards: [keep('Three'), keep('Two'), keep('Two')] }, { cards: [keep('Two'), keep('One')] }],
  'Show me the weather card': [{ cards: [{ action: 'weather.card', input: {}, intent: 'the weather' }] }],
  'Three things, the last wide beneath': [{ title: 'Three things', columns: 2, cards: [say('One'), say('Two'), { ...say('Three'), span: 2 }] }],
  'Two things, one given two ways': [{ cards: [say('One'), { ...keep('Two'), ...say('Two') }] }, { title: 'Two again', cards: [say('One'), say('Two')] }],
  'the other way round, written out': [{ title: 'Two again', cards: [say('Two'), say('One')] }],
  'Who may sign in?': [{ title: 'Who', columns: 2, cards: [{ action: 'people.list', input: {}, intent: 'who may sign in' }] }],
  'and a note beside it': [{ title: 'Who, noted', cards: [keep('People'), say('A note', 'Invite Ada next.')] }],
  'What can you do?': [{ title: 'What it does', columns: 1, cards: [say('What this app does', 'It answers with screens.')] }],
  'Show the first screen': [{ screen: FIRST.id }],
  'What is the weather in Vienna?': [{ response: 'Nothing in this app shows the weather.', cards: [] }],
  'Name it at length': [{ title: 'A title that runs on well past the forty characters a title may have', cards: [] }],
  'Only one thing': [{ columns: 1, cards: [say('One')] }],
  'Call me Max': [{ response: 'Max it is.', title: 'You', columns: 1, cards: [{ action: 'people.me', input: { name: 'Max' }, intent: 'the name to call them' }] }],
  'Hello again': [{ response: 'Hello, Max.', cards: [] }],
};

const { check, finish } = checks('compose');
const START = FIRST.cards.map((card) => card.action).join(' ');

const scripted = scriptedModels(SCRIPT);
const { prompts } = scripted;
const lastPrompt = (): string => prompts[prompts.length - 1] ?? '';
const app = await startApp(scripted.models);
const { on, card, cards, current, total, grid, areas, ids, said, drawn, marked, inks, rows, runs, ask, session } = app;
const browsing = (): boolean => on('dock').data['browsing'] === true;
const titles = (): string => cards().map((held) => String(held.data['title'] ?? held.action)).join(' ');
const listed = (place: number, key: string): unknown[] => {
  const value = card(place).data[key];
  return Array.isArray(value) ? value : [];
};
try {
  const template = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
  const page = await renderDocument({ ...drawing, server: app.server, template, request: { path: '/', cookie: `nisc.token=${app.token}` } });
  check('the page arrives drawn for the person signed in: the first screen, and the dock with the screens and the line to ask in', page.drawn && ['k-frame', 'k-dock', 'k-prompt'].every((part) => page.html.includes(part)), page.html.slice(0, 300));

  check('the app opens on the first screen: its cards on the screen canvas, in order, and the stack starts there', areas() === START && on('dock').action === 'ask.dock' && current().position === 1 && total() === 1, areas());
  check('the screen canvas is laid out as the first screen is: its columns, an area for each card', current().columns === FIRST.columns && grid() === '2: 1 2', `${String(current().columns)} — ${grid()}`);

  app.draw();
  session.dispatch('dock', { type: 'ui:model', ref: 'zone', payload: 'Europe/Vienna' });
  runs.length = 0;
  await ask('Two things side by side');
  check(
    'each message is recorded as the model\'s run, with its model, what it spent and how it ended',
    runs.map((run) => `${run.agentId} ${run.model} ${run.outcome} ${run.steps} ${run.totalTokens} ${run.label}`).join(' | ') === 'mira.compose chat ok 1 110 Two things side by side',
    JSON.stringify(runs),
  );
  check(
    'the model is shown the first screen as it is, and told an answer asked on it starts from an empty one',
    prompts[0]?.includes(`The first screen, "${FIRST.label}", 1 of 1 in the stack (${FIRST.label}): it welcomes your person, and shows "Mira" — words: `) === true && prompts[0].includes('an answer asked on the first screen starts from an empty screen'),
    prompts[0]?.slice(0, 600) ?? '',
  );
  check(
    'the model is told about its person: no name yet, so to ask for one; that they own this Mira; and their time, where their device is',
    prompts[0]?.includes('YOUR PERSON\n- Their name: you do not know it yet. End your response by asking what they would like you to call them') === true && prompts[0].includes('- They own this Mira') && prompts[0].includes(' (Europe/Vienna).'),
    prompts[0]?.slice(prompts[0].indexOf('YOUR PERSON'), prompts[0].indexOf('YOUR PERSON') + 400) ?? '',
  );
  check('words the model says are placed where it says, in the room it gives', areas() === 'answer.text answer.text' && titles() === 'One Two' && grid() === '2: 1 2', `${areas()} — ${titles()} — ${grid()}`);
  check('words written where the first screen’s card was keep nothing of it, not its large title', card(1).data['tone'] === 'default', JSON.stringify(card(1).data));
  check('none of the first screen’s cards stay: every card the answer put there is new, and no word on the screen says it', marked() === '1:new 2:new' && !drawn().includes('"value":"New"'), marked());
  check('an answer that changed the screen is not said again in the dock: the screen answers', current()['said'] === undefined && !drawn().includes('"tone":"reply"'), String(current()['said']));
  check('a card the answer wrote is in the answer’s own ink, the first of the turn', inks() === '1:turn-1 2:turn-1' && current().ink === 'turn-1', inks());
  check('the line is in the ink of the answer that comes next', current().next === 'turn-2' && /"name":"Dock","props":\{"ink":"turn-2"/.test(drawn()), drawn().match(/"name":"Dock","props":\{[^}]*\}/)?.[0] ?? '');
  check('the chip in the dock names the answer shown by its title, and where it stands among the answers', drawn().includes('"label":"Two things"') && drawn().includes('"count":"2/2"'), drawn().match(/"label":"Two things"[^}]*/)?.[0] ?? '');
  session.dispatch('dock', { type: 'ui:click', ref: 'chip' });
  check(
    'the chip opens every answer side by side, over the answer: what was asked, what the model said it did, each card by its title',
    (await until(() => on('overview').action === 'ask.deck' && rows('overview', 'answers').length === 2)) && browsing() && drawn().includes('Put the two side by side.') && drawn().includes('“Two things side by side”'),
    JSON.stringify(rows('overview', 'answers')).slice(0, 300),
  );
  check('…the answer shown picked', on('overview').data['selected'] === 2 && on('dock').data['browse'] === 2, String(on('overview').data['selected']));
  session.dispatch('dock', { type: 'ui:click', ref: 'deck-back' });
  check('…back moves the pick, not the answer shown', (await until(() => on('overview').data['selected'] === 1 && on('dock').data['browse'] === 1)) && current().position === 2, `${String(on('overview').data['selected'])} ${String(current().position)}`);
  session.dispatch('dock', { type: 'ui:click', ref: 'deck-back' });
  await settle();
  check('…and stops at the first', on('overview').data['selected'] === 1, String(on('overview').data['selected']));
  session.dispatch('dock', { type: 'ui:key', ref: 'deck-keys', key: 'Escape' });
  check('Escape closes it on the answer that was shown', (await until(() => on('overview').action === '' && !browsing())) && current().position === 2, `${on('overview').action} ${String(current().position)}`);

  const first = card(1).id;
  await ask('drop the second');
  check('an answer asked on an answer is given the screen open: its cards in reading order, each by its title, with what it holds', lastPrompt().includes('in 2 columns:\n1. "One" — words: "About One."\n2. "Two" — words: "About Two."'), lastPrompt().slice(-500));
  check('an answer that only drops a card marks nothing, and what stays keeps its ink', marked() === '' && inks() === '1:turn-1', `${marked()} — ${inks()}`);
  check('a card the answer leaves out is gone, and the one that stays is the same instance', cards().length === 1 && card(1).id === first, ids());
  const inksWhileAsked = new Set<string>();
  const sampling = setInterval(() => {
    const tree = drawn();
    const dock = /"name":"Dock","props":(\{[^}]*\})/.exec(tree)?.[1] ?? '';
    if (dock.includes('"asking":true')) inksWhileAsked.add(`${/"ink":"([^"]+)"/.exec(dock)?.[1] ?? ''} ${/"label":"the second again, beside it","count":"…","ink":"([^"]+)"/.exec(tree)?.[1] ?? ''}`);
  }, 1);
  await ask('the second again, beside it');
  clearInterval(sampling);
  check(
    'while a question is answered, the line stays in the ink of the answer after it and the chip in the ink of the one asked for, though the stack counts it before it ends',
    inksWhileAsked.size === 1 && inksWhileAsked.has('turn-4 turn-3'),
    [...inksWhileAsked].join(' | '),
  );
  check('a card kept stays the same instance, in its place; what is new goes where the model puts it', card(1).id === first && card(2).data['title'] === 'Two', ids());
  check('a card put on the screen is marked new, in the ink of its turn', marked() === '2:new' && inks() === '1:turn-1 2:turn-3', `${marked()} — ${inks()}`);
  const [one, two] = [card(1).id, card(2).id];
  await ask('swap them');
  check('the answer streams in: a card is placed while the rest of the reply is still being written', app.streamed() > 0, String(app.streamed()));
  check('cards the model keeps in another order move there, each the same instance it was', titles() === 'Two One' && card(1).id === two && card(2).id === one, `${titles()} — ${ids()}`);
  check('…and a card that only moved keeps its ink and is not marked', marked() === '' && inks() === '1:turn-3 2:turn-1', `${marked()} — ${inks()}`);
  await ask('other words for the first');
  check('a card the model writes again where it stands keeps its place and its instance, and takes what it is given', card(2).id === one && card(2).data['text'] === 'Said again.', JSON.stringify(card(2).data));
  check('…marked as changed, in the ink of its turn', marked() === '2:changed', marked());

  prompts.length = 0;
  await ask('keep what is not there');
  check(
    'keeping a card that is not on the screen, or one card twice, is sent back saying so, with the cards that are',
    (prompts[1] ?? '').includes('cards[0]: there is no card "Three" on the screen; its cards are "Two", "One".') && (prompts[1] ?? '').includes('cards[2]: the card "Two" is kept already'),
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
  check('a model run refused three times is recorded as failed, with its three steps', runs[0]?.outcome === 'failed' && runs[0]?.steps === 3 && runs[0]?.totalTokens === 330, JSON.stringify(runs[0]));

  await ask('Three things, the last wide beneath');
  check('the columns and the room the model gives are the ones the answer is laid out in', current().columns === 2 && grid() === '2: 1 2 3×2' && areas() === 'answer.text answer.text answer.text', `${String(current().columns)} — ${grid()} — ${areas()}`);
  prompts.length = 0;
  await ask('Two things, one given two ways');
  check('a card given two things at once is sent back saying so', (prompts[1] ?? '').includes('cards[1]: give exactly one of') && areas() === 'answer.text answer.text' && grid() === '2: 1 2', `${areas()} — ${grid()}`);

  const [givenOne, givenTwo] = [card(1).id, card(2).id];
  await ask('the other way round, written out');
  check('cards the model writes out again as they are, in another order, are the same cards: they move, and nothing is written', titles() === 'Two One' && card(1).id === givenTwo && card(2).id === givenOne && marked() === '', `${titles()} — ${ids()} — ${marked()}`);

  await ask('Who may sign in?');
  await until(() => listed(1, 'rows').length > 0);
  const people = card(1).id;
  app.draw();
  session.dispatch('screen', { type: 'ui:model', ref: 'email', payload: 'ada@example.com', origin: people });
  await settle();
  await ask('and a note beside it');
  check('a card kept beside a new one is the same instance, with what was typed into it', card(1).id === people && card(1).data['email'] === 'ada@example.com' && card(2).data['title'] === 'A note', `${ids()} — ${JSON.stringify(card(1).data['email'])}`);
  session.dispatch('dock', { type: 'ui:click', ref: 'back' });
  check('going back to an answer that shares a card keeps that card’s instance', (await until(() => current().question === 'Who may sign in?')) && cards().length === 1 && card(1).id === people, `${String(current().question)} — ${ids()}`);
  session.dispatch('dock', { type: 'ui:click', ref: 'forward' });
  await until(() => current().question === 'and a note beside it');
  await settle();

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
  session.dispatch('screen', { type: 'ui:click', ref: 'suggestion', payload: 'What can you do?', origin: card(2).id });
  check('a thing to ask, pressed on the first screen, is asked as if typed', (await until(() => app.answered() > answeredBefore)) && lastPrompt().endsWith('\n\nWhat can you do?'), lastPrompt().slice(-200));
  await settle();
  check('words the model says are shown as words', areas() === 'answer.text' && card(1).data['title'] === 'What this app does', areas());

  await ask('Show the first screen');
  check('the model can answer with one of the app’s screens: gone back to where it is in the stack', current().screen === FIRST.id && current().position === 1, `${String(current().position)} of ${total()}`);

  const beforeWeather = ids();
  const stackBeforeWeather = total();
  await ask('What is the weather in Vienna?');
  check('an answer that changes nothing leaves the screen as it was, and adds nothing to the stack', ids() === beforeWeather && total() === stackBeforeWeather && said() === '', `${ids()} — ${String(total())} — ${said()}`);
  check('and the bar says what was asked, and why nothing changed', current().question === 'What is the weather in Vienna?' && current().response === 'Nothing in this app shows the weather.', JSON.stringify(current()).slice(0, 200));
  check(
    '…and the reply is said in the dock, under the chip',
    current()['said'] === 'Nothing in this app shows the weather.' && drawn().includes('"tone":"reply"},"children":[{"type":"text","value":"Nothing in this app shows the weather."'),
    drawn().match(/"tone":"reply"[^\]]*\]/)?.[0] ?? 'no reply in the dock',
  );
  check(
    'the model is given the chat so far: what the person asked before and what it replied, the oldest first, and the message last',
    lastPrompt().endsWith('\n\nShow the first screen\n\nScripted.\n\nWhat is the weather in Vienna?') && lastPrompt().indexOf('\n\nShow the first screen\n\n') > lastPrompt().indexOf('THE SCREEN'),
    lastPrompt().slice(0, 600),
  );

  scripted.unreachable(true);
  runs.length = 0;
  await ask('Only one thing');
  check('a model that cannot be reached leaves the screen as it was, and the line says so', ids() === beforeWeather && said().includes('could not be reached'), said());
  check(
    'the model is shown the dock as the person saw it: the chip, and what it said back last under it',
    lastPrompt().includes(`The first screen, "${FIRST.label}", `) && lastPrompt().includes('The dock: the chip naming "Scripted", back and forward beside it; under it, what you said back last: "Nothing in this app shows the weather."; the line; the screens '),
    lastPrompt().slice(-700),
  );
  check('…and the reply to the message before it is no longer said', !drawn().includes('"tone":"reply"'), drawn().match(/"tone":"reply"[^\]]*\]/)?.[0] ?? '');
  check('and its run is recorded as failed: one step, nothing spent', runs[0]?.agentId === 'mira.compose' && runs[0]?.outcome === 'failed' && runs[0]?.steps === 1 && runs[0]?.totalTokens === 0, JSON.stringify(runs[0]));
  scripted.unreachable(false);

  runs.length = 0;
  await ask('Name it at length');
  check('a reply that does not fit the reply’s schema is refused: the screen stays, and the line says it did not fit', ids() === beforeWeather && said().includes('did not fit'), said());
  check('and its run is recorded as failed, with its three steps', runs[0]?.outcome === 'failed' && runs[0]?.steps === 3, JSON.stringify(runs[0]));

  session.dispatch('dock', { type: 'ui:click', ref: 'forward' });
  check('forward from the first screen is the answer after it, as it was', await until(() => current().position === 2 && current().question === 'Two things side by side' && card(1).data['title'] === 'One'), `position ${String(current().position)}, ${areas()}`);
  session.dispatch('dock', { type: 'ui:click', ref: 'back' });
  check('back is the first screen again', await until(() => current().position === 1 && current().screen === FIRST.id), `position ${String(current().position)}`);
  session.dispatch('dock', { type: 'ui:key', ref: 'keys', key: 'ArrowRight' });
  check('the right arrow is forward too', await until(() => current().position === 2), `position ${String(current().position)}`);
  session.dispatch('dock', { type: 'ui:key', ref: 'keys', key: 'ArrowLeft' });
  check('…and the left arrow back', await until(() => current().position === 1), `position ${String(current().position)}`);

  session.dispatch('dock', { type: 'ui:click', ref: 'chip' });
  await until(() => on('overview').action === 'ask.deck' && rows('overview', 'answers').length === total());
  const deck = rows('overview', 'answers').map(recordOf);
  check(
    'the overview holds every answer, by its title or the screen it is',
    deck.length === total() && deck[0]?.['label'] === FIRST.label && deck[0]['screen'] === true && deck[1]?.['label'] === 'Two things',
    JSON.stringify(deck.map((entry) => entry['label'])),
  );
  check(
    '…each with its cards: their titles, where its answer put them, and the inks they were in',
    JSON.stringify((deck[1]?.['layers'] as unknown[]).map((layer) => ({ ...recordOf(layer), tree: undefined }))) === JSON.stringify([
      { name: '1', span: 1, row: 1, column: 1, ink: 'turn-1', fresh: 'new', title: 'One', text: 'About One.' },
      { name: '2', span: 1, row: 1, column: 2, ink: 'turn-1', fresh: 'new', title: 'Two', text: 'About Two.' },
    ]) && JSON.stringify(recordOf((deck[1]?.['layers'] as unknown[])[0])['tree']).includes('"name":"Card","props":{"title":"One"'),
    JSON.stringify(deck[1]?.['layers']),
  );
  session.dispatch('dock', { type: 'ui:click', ref: 'deck-forward' });
  await until(() => on('overview').data['selected'] === 2);
  session.dispatch('dock', { type: 'ui:key', ref: 'deck-keys', key: 'Enter' });
  check('Enter opens the one picked, and the overview closes', await until(() => current().position === 2 && on('overview').action === '' && !browsing()), `${String(current().position)} ${on('overview').action}`);
  session.dispatch('dock', { type: 'ui:click', ref: 'chip' });
  await until(() => on('overview').action === 'ask.deck' && rows('overview', 'answers').length === total());
  session.dispatch('overview', { type: 'ui:click', ref: 'mini', payload: 4 });
  check('an answer pressed there is shown as it was, and the overview closes', await until(() => current().position === 4 && card(2).data['title'] === 'Two' && on('overview').action === '' && !browsing()), `${String(current().position)}, ${titles()}`);

  await app.openScreen('conversation');
  await until(() => listed(1, 'exchanges').length > 0);
  const exchanges = listed(1, 'exchanges').map(recordOf);
  const firstAsked = exchanges.find((exchange) => exchange['question'] === 'Two things side by side');
  check(
    'the Conversation screen lists every message and what was said back, the oldest first, those that changed nothing too',
    card(1).action === 'ask.conversation' && exchanges[0]?.['question'] === 'Two things side by side' && exchanges.at(-1)?.['question'] === 'What is the weather in Vienna?' && exchanges.at(-1)?.['reply'] === 'Nothing in this app shows the weather.' && exchanges.at(-1)?.['screen'] === FIRST.id && firstAsked?.['position'] === 2,
    `${card(1).action} ${JSON.stringify(card(1).data).slice(0, 300)} ${String(current().screen)}`,
  );
  session.dispatch('screen', { type: 'ui:click', ref: 'opens-answer', payload: 2, origin: card(1).id });
  check('…and one pressed opens the answer it was', await until(() => current().position === 2 && current().question === 'Two things side by side'), `${String(current().position)} ${String(current().question)}`);

  await app.openScreen('people');
  await until(() => listed(1, 'rows').length > 0);
  await app.openScreen('conversation');
  session.dispatch('dock', { type: 'ui:click', ref: 'chip' });
  await until(() => on('overview').action === 'ask.deck' && rows('overview', 'answers').length === total());
  const pictured = JSON.stringify(recordOf(rows('overview', 'answers').map(recordOf).find((entry) => entry['label'] === 'People'))['layers']);
  check('the overview draws an answer by its cards as nova drew them: People with the people in it', pictured.includes(OWNER) && pictured.includes('"name":"Card"'), pictured.slice(0, 300));
  const pictures = rows('overview', 'answers').length;
  session.dispatch('overview', { type: 'ui:click', ref: 'close', payload: 2 });
  check(
    'an answer closed in the overview leaves it, and the stack',
    await until(() => rows('overview', 'answers').length === pictures - 1 && total() === pictures - 1),
    `${String(rows('overview', 'answers').length)} pictures, ${String(total())} in the stack, from ${String(pictures)}`,
  );
  session.dispatch('overview', { type: 'ui:click', ref: 'close', payload: 1 });
  await settle();
  check('…and the first screen cannot be closed', rows('overview', 'answers').length === pictures - 1 && recordOf(rows('overview', 'answers')[0])['label'] === FIRST.label, String(rows('overview', 'answers').length));
  session.dispatch('dock', { type: 'ui:key', ref: 'deck-keys', key: 'Escape' });
  await until(() => on('overview').action === '');

  await ask('Call me Max');
  await until(() => card(1).action === 'people.me' && recordOf(card(1).data['me'])['email'] === OWNER);
  check('the model opens the You card with the name it is given, for the person to save', card(1).action === 'people.me' && card(1).data['name'] === 'Max' && recordOf(card(1).data['me'])['name'] === null, JSON.stringify(card(1).data));
  session.dispatch('screen', { type: 'ui:click', ref: 'save', origin: card(1).id });
  check('…which keeps it when they press Save', await until(() => recordOf(card(1).data['me'])['name'] === 'Max'), JSON.stringify(card(1).data));
  await ask('Hello again');
  check('and from then on the model knows their name', lastPrompt().includes('YOUR PERSON\n- Their name: "Max".'), lastPrompt().slice(lastPrompt().indexOf('YOUR PERSON'), lastPrompt().indexOf('YOUR PERSON') + 200));
} finally {
  app.server.close();
}

const keyless = await startApp(scriptedModels(SCRIPT, { keyless: true }).models);
try {
  await keyless.ask('Only one thing');
  check('with no key, the line names the key, and the screen stays as it was', keyless.said().includes('GROQ_API_KEY'), keyless.said());
} finally {
  keyless.server.close();
}

finish();
