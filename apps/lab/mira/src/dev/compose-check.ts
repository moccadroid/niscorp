import type { SignalClient, Usage } from '@niscorp/cortex';
import { renderDocument } from '@niscorp/moss';
import type { RunRecord } from '@niscorp/moss';
import { routeResponse } from '@niscorp/signal';
import type { StepRequest, StepResult } from '@niscorp/signal';
import { z } from 'zod';
import { SCREENS } from '../app/screens';
import { AREAS } from '../app/shell/areas';
import { boot } from '../server/boot';
import type { Decide, Models } from '../server/compose';
import { drawing } from '../server/document';

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const recordOf = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

// Offline, and the same every run: a decision model that finds nothing likely, and a chat model that answers each
// message with the replies scripted for it, one per call.
const card = (action: string) => ({ action, input: {}, intent: action.replace('guide.', 'the guide on ') });
const keep = (area: string, from = area) => ({ area, keep: from });
const put = (area: string, canvas: object) => ({ area, ...canvas });
const say = (area: string, title: string, text: string) => ({ area, say: { title, text } });
const gridOf = (columns: number, ...areas: [string, number][]): unknown => ({ columns, areas: areas.map(([name, span]) => ({ name, span })) });
const counter = (title: string, count: number) => ({ action: 'guide.counter', input: { title, count }, intent: 'a counter' });
const checklist = (title: string, todo: string[]) => ({ action: 'guide.checklist', input: { title, todo }, intent: 'a checklist' });

const REPLIES: Record<string, Record<string, unknown>[]> = {
  'What is the charter?': [{ response: 'Put the charter where the nisc card was; the rest stays.', title: 'The charter', areas: [put('e', card('guide.charter'))] }],
  'drop the checklist': [{ areas: [{ area: 'd', drop: true }] }],
  'A counter that starts at 100': [{ areas: [put('b', counter('From 100', 100))] }],
  'A checklist with no steps': [{ areas: [put('d', checklist('Empty', []))] }, { areas: [put('d', checklist('Mine', ['One step']))] }],
  'Only the charter': [{ areas: [put('a', card('guide.charter'))], arrangement: 'single' }],
  'What is an action?': [{ areas: [put('a', card('guide.actions'))] }],
  'and the charter beside it': [{ areas: [keep('a'), put('b', card('guide.charter'))], arrangement: 'pair' }],
  'the charter first': [{ areas: [keep('a', 'b'), keep('b', 'a')] }],
  'keep what is not there': [{ areas: [keep('a', 'f'), put('c', card('guide.shell'))] }, { areas: [keep('a')] }],
  'actions twice': [{ areas: [put('a', card('guide.actions')), keep('b')] }, { areas: [keep('a'), keep('b')] }],
  'Show me the weather card': [{ areas: [put('a', card('guide.weather'))] }],
  'Three cards, the last wide beneath': [{ areas: [put('a', card('guide.nisc')), put('b', card('guide.shell')), put('c', card('guide.data'))], grid: gridOf(2, ['a', 1], ['b', 1], ['c', 2]) }],
  'Two cards, in a grid of my own': [
    { areas: [put('a', card('guide.nisc')), put('b', card('guide.data')), { area: 'c', drop: true }], grid: gridOf(2, ['a', 1], ['a', 1]) },
    { areas: [put('a', card('guide.nisc')), put('b', card('guide.data')), { area: 'c', drop: true }] },
  ],
  'What can you do?': [{ areas: [say('a', 'What this app does', 'It explains nisc: ask about it, and the answer is a screen of cards.')], arrangement: 'single' }],
  'the shell, and say what it is': [{ areas: [say('a', 'The shell', 'Where the app runs.'), put('b', card('guide.shell'))], arrangement: 'pair' }],
  'Show the start screen': [{ screen: 'start' }],
  'What is the weather in Vienna?': [{ response: 'Nothing in this app shows the weather.', areas: [] }],
  'Name it at length': [{ title: 'A title that runs on well past the forty characters a title may have', areas: [] }],
};

const SPENT: Usage = { inputTokens: 100, outputTokens: 10, totalTokens: 110, reported: true };

// The ids Jev finds likely: a question naming one is answered yes.
let likely: readonly string[] = [];
let asked: { state: Record<string, unknown>; questions: Record<string, unknown> }[] = [];
const decide: Decide = async (state, questions) => {
  asked.push({ state, questions });
  const answer = (instructions: string): { yes: boolean; probability: number } => (likely.some((id) => instructions.includes(`"${id}"`)) ? { yes: true, probability: 0.9 } : { yes: false, probability: 0.1 });
  return { picked: Object.fromEntries(Object.entries(questions).map(([name, question]) => [name, answer(question.instructions)])), usage: SPENT };
};

let prompts: string[] = [];
const turns = new Map<string, number>();
let unreachable = false;
// The chat model, scripted as relay's checks script one: each step answers the message in the run's input with the next
// envelope scripted for it, the last one again and again.
const scripted = (request: StepRequest): StepResult => {
  const user = request.messages.map((message) => (typeof message.content === 'string' ? message.content : '')).join('\n\n');
  prompts.push(user);
  if (unreachable) throw new Error('the provider did not answer');
  const message = /^MESSAGE: (.*)$/m.exec(user)?.[1] ?? '';
  const turn = turns.get(message) ?? 0;
  turns.set(message, turn + 1);
  const replies = REPLIES[message] ?? [{ areas: [] }];
  const { response = 'Scripted.', ...data } = replies[Math.min(turn, replies.length - 1)] ?? {};
  const content = JSON.stringify({ response, data: { title: 'Scripted', ...data } });
  const base: StepResult = { content, toolCalls: [], usage: SPENT, finishReason: 'stop', raw: null };
  if (request.output === undefined) return base;
  const routed = routeResponse({ content, toolCalls: [], declared: new Set(), accept: request.output.accept, responseStrategies: [] });
  return { ...base, outcome: routed.outcome, wire: routed.wire };
};
const chat: SignalClient = {
  step: async (request) => scripted(request),
  stepStream: (request) => {
    const result = scripted(request);
    // In pieces, as a provider streams it, so the reply is read while it is written.
    return (async function* () {
      for (let at = 0; at < result.content.length; at += 24) {
        yield { type: 'text' as const, text: result.content.slice(at, at + 24) };
        await new Promise((done) => setTimeout(done, 1));
      }
      yield { type: 'done' as const, result };
    })();
  },
  count: async () => 1,
  describe: () => ({ provider: 'scripted', model: 'chat', kind: 'chat', modelKnown: false, capabilities: { nativeTools: true, nativeJsonSchema: false, nativeJsonMode: true, toolsWithStructuredOutput: false, validatesToolArgs: true, manglesNestedToolArgs: false, multimodal: false, supportsEmbedding: false } }),
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
const START = actionsOf(SCREENS[0]?.canvases ?? []);

const runs: RunRecord[] = [];
const models: Models = { jev: { provider: 'scripted', model: 'jev', decide }, chat: { provider: 'scripted', model: 'chat', llm: chat, timeoutMs: 5000 }, missing: [] };
const { server } = await boot({ models, runs: (run) => runs.push(run) });
try {
  const shells = server.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');

  const template = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
  const page = await renderDocument({ ...drawing, server, template, request: { path: '/', cookie: null } });
  check('the page arrives drawn: the first screen, and the dock with the screens and the line to ask in', page.drawn && ['k-frame', 'k-dock', 'k-prompt', 'Welcome to nisc', 'Start the tour', 'Press me'].every((part) => page.html.includes(part)), page.html.slice(0, 300));

  const session = await shells.session(null, null);
  const shell = session.shell;
  let answered = 0;
  let moves = 0;
  let movesWhenAnswered = 0;
  shell.onEndpoint((event) => {
    if (event.canvasId !== 'dock') return;
    if (event.name === 'current') moves += 1;
    if (event.name === 'ask') {
      answered += 1;
      movesWhenAnswered = moves;
    }
  });
  const on = (canvas: string): { action: string; id: string; data: Record<string, unknown> } => {
    const active = shell.getState().canvases[canvas]?.active;
    return { action: active?.definitionId ?? '', id: active?.id ?? '', data: active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {}) };
  };
  const areas = (): string => AREAS.map((area) => on(area).action).filter((action) => action !== '').join(' ');
  const ids = (): string => AREAS.map((area) => `${area}:${on(area).id}`).join(' ');
  const ShownSchema = z.looseObject({
    question: z.string().optional(),
    response: z.string().optional(),
    screen: z.string().optional(),
    arrangement: z.string().optional(),
    position: z.number().optional(),
    total: z.number().optional(),
    stack: z.array(z.looseObject({ position: z.number(), label: z.string() })).optional(),
  });
  const nodesOf = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.map(recordOf) : []);
  const named = (name: string, nodes: unknown): Record<string, unknown>[] => nodesOf(nodes).flatMap((node) => (node['name'] === name ? [node] : named(name, node['children'])));
  // The grid the frame's `answers` region holds, as the shell draws it: its columns, and each area's name and span.
  const grid = (): string => {
    const answers = named('Grid', shell.getShellRenderTree())[0] ?? {};
    const held = nodesOf(answers['children']).map((area) => {
      const own = recordOf(area['props']);
      return `${String(own['name'])}${Number(own['span'] ?? 1) > 1 ? `×${String(own['span'])}` : ''}`;
    });
    return `${String(recordOf(answers['props'])['columns'])}: ${held.join(' ')}`;
  };
  // The areas the layout on screen marks as changed by the last answer.
  const marked = (): string =>
    named('Area', shell.getShellRenderTree())
      .map((area) => recordOf(area['props']))
      .filter((props) => props['changed'] === true)
      .map((props) => String(props['name']))
      .join(' ');
  const drawn = (): string => JSON.stringify(shell.flattenRenderTree(shell.getShellRenderTree()));
  const current = (): z.infer<typeof ShownSchema> => ShownSchema.safeParse(on('dock').data['current']).data ?? {};
  const total = (): number => Number(current().total);
  const said = (): string => String(on('dock').data['error'] ?? '');
  // What a terminal does whenever the screen changes: draw every action on it. An input takes what is typed into it
  // once it has been drawn. A message is answered when the line's `ask` call ends, whatever it leaves on screen.
  const draw = (): void => void shell.flattenRenderTree(shell.getShellRenderTree());
  const lastPrompt = (): string => prompts[prompts.length - 1] ?? '';
  let streamed = 0;
  const ask = async (text: string): Promise<void> => {
    draw();
    const seen = answered;
    const movesBefore = moves;
    session.dispatch('dock', { type: 'ui:model', ref: 'text', payload: text });
    session.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
    await until(() => answered > seen);
    streamed = movesWhenAnswered - movesBefore;
    await settle();
  };
  const openMenu = async (id: string): Promise<void> => {
    session.dispatch('dock', { type: 'ui:click', ref: 'screen', payload: id });
    await until(() => current().screen === id);
    await settle();
  };
  const rows = (canvas: string, key: string): unknown[] => {
    const value = on(canvas).data[key];
    return Array.isArray(value) ? value : [];
  };
  const without = (area: string, of: string): string => of.replace(new RegExp(`${area}:\\S*`), '');

  check('the app opens on the first screen, every one of its canvases an area of its own, and the stack starts there', areas() === START && on('dock').action === 'ask.dock' && current().position === 1 && total() === 1, areas());
  check('the frame’s region holds the first screen’s arrangement', current().arrangement === SCREENS[0]?.arrangement && grid() === '2: a×2 b c d e', `${String(current().arrangement)} — ${grid()}`);

  draw();
  session.dispatch('b', { type: 'ui:click', ref: 'up' });
  session.dispatch('b', { type: 'ui:click', ref: 'up' });
  check('the counter counts what is pressed, and starts over at what it was opened with', await until(() => on('b').data['count'] === 2), JSON.stringify(on('b').data));
  session.dispatch('c', { type: 'ui:click', ref: 'pick', payload: 1 });
  check('the quick check, picked right, says so and why', await until(() => drawn().includes('Right. Links and buttons act at once')), JSON.stringify(on('c').data));
  session.dispatch('d', { type: 'ui:click', ref: 'tick', payload: 0 });
  check('a step ticked off moves from the steps to do to the ones done', await until(() => rows('d', 'done').join() === 'Press the counter' && rows('d', 'todo').length === 4), JSON.stringify(on('d').data));
  draw();
  session.dispatch('d', { type: 'ui:model', ref: 'adding', payload: 'Read the charter' });
  session.dispatch('d', { type: 'ui:click', ref: 'add' });
  check('a step typed and added goes last among the steps to do, and the line empties', await until(() => rows('d', 'todo').at(-1) === 'Read the charter' && on('d').data['adding'] === ''), JSON.stringify(on('d').data));

  const startIds = ids();
  runs.length = 0;
  likely = ['guide.charter'];
  await ask('What is the charter?');
  likely = [];
  const jev = asked[asked.length - 1];
  check(
    'each message is recorded as two runs: Jev\'s pass and the model\'s, each with its model, what it spent and how it ended',
    runs.map((run) => `${run.agentId} ${run.model} ${run.outcome} ${run.steps} ${run.totalTokens} ${run.label}`).join(' | ') === 'mira.jev jev ok 1 110 What is the charter? | mira.compose chat ok 1 110 What is the charter?',
    JSON.stringify(runs),
  );
  check('Jev is asked about the message with the open screen: an intent for each canvas', jev?.state['message'] === 'What is the charter?' && Object.keys(recordOf(jev?.state['open_screen'])).join(',') === 'a,b,c,d,e', JSON.stringify(jev?.state['open_screen']));
  check(
    'the model is given the open screen by area — where each area is, what each holds — and what Jev thinks',
    lastPrompt().includes('arrangement hero: a (the whole width); b c; d e') && lastPrompt().includes('- b: guide.counter') && lastPrompt().includes('A FAST PICKER THINKS (a hint; how likely each belongs in the answer): actions guide.charter 0.90; reads none; writes none; screens none'),
    lastPrompt().slice(0, 600),
  );
  check(
    'and each card as the person left it: the count pressed, the steps ticked and added, the pick made',
    lastPrompt().includes('input {"title":"Press me","count":2}') &&
      lastPrompt().includes('"done":["Press the counter"]') &&
      lastPrompt().includes('"Ask the model to change a card","Read the charter"]') &&
      lastPrompt().includes('"picked":1}'),
    lastPrompt().slice(0, 1600),
  );
  check(
    'from the first screen, "What is the charter?" puts the charter where the model says, and nothing else moves',
    without('e', ids()) === without('e', startIds) && on('e').action === 'guide.charter' && current().arrangement === 'hero' && grid() === '2: a×2 b c d e',
    `${ids()} vs ${startIds} — ${grid()}`,
  );
  check('a card the answer leaves alone keeps what the person did to it', on('b').data['count'] === 2 && rows('d', 'done').length === 1, JSON.stringify(on('b').data));
  check('a guide card holds its own text: its lead, its example, and where it leads', on('e').data['title'] === 'The charter' && String(on('e').data['example']).includes('"public"') && rows('e', 'links').length === 1, JSON.stringify(on('e').data).slice(0, 200));
  check('the area the answer changed is outlined, and only that one', marked() === 'e', marked());
  check('the chip in the dock names the answer shown by its title, and where it stands among the answers', drawn().includes('"The charter · 2/2"'), drawn().match(/"label":"[^"]*· \d+\/\d+"/)?.[0] ?? '');
  session.dispatch('dock', { type: 'ui:click', ref: 'stack' });
  await settle();
  check('opening the chip shows what was asked, what the model said it did, and the answers to go back to', current().response === 'Put the charter where the nisc card was; the rest stays.' && drawn().includes('the rest stays') && drawn().includes('1. Start') && drawn().includes('2. The charter') && drawn().includes('What is the charter?'), String(current().response));
  session.dispatch('dock', { type: 'ui:click', ref: 'stack' });
  const charterIds = ids();
  await ask('drop the checklist');
  check('when Jev finds nothing likely, the model is given no hint', !lastPrompt().includes('FAST PICKER'), lastPrompt().slice(-300));
  check('an answer that only empties an area outlines nothing', marked() === '', marked());
  check('an area the model drops is emptied, and every other stays as it was', on('d').id === '' && without('d', ids()) === without('d', charterIds) && current().arrangement === 'hero', `${ids()} vs ${charterIds}`);

  const link = recordOf(rows('e', 'links')[0]);
  const promptsBeforeLink = prompts.length;
  const stackBeforeLink = total();
  session.dispatch('e', { type: 'ui:click', ref: 'link', payload: link['screen'] });
  check(
    'a card’s link opens its screen at once, and asks nothing of the model',
    (await until(() => current().screen === 'yours')) && prompts.length === promptsBeforeLink && areas() === 'guide.yours guide.checklist' && current().arrangement === 'pair' && total() === stackBeforeLink + 1,
    `${String(current().screen)} — ${areas()} — ${prompts.length - promptsBeforeLink} prompts`,
  );
  await settle();
  await openMenu('start');
  check('a screen gone back to is as the person left it', on('b').data['count'] === 2 && rows('d', 'done').join() === 'Press the counter' && on('c').data['picked'] === 1, `${JSON.stringify(on('b').data)} ${JSON.stringify(on('d').data)}`);
  await openMenu('asking');
  check('another quick check where an answered one was opens unanswered', on('c').action === 'guide.quiz' && on('c').data['picked'] === -1, JSON.stringify(on('c').data));
  await openMenu('start');
  const counterId = on('b').id;
  await ask('A counter that starts at 100');
  check('a card the model opens again with another input keeps its place and its instance, and takes the input', on('b').id === counterId && on('b').data['count'] === 100 && on('b').data['title'] === 'From 100', JSON.stringify(on('b').data));
  prompts = [];
  await ask('A checklist with no steps');
  check('a checklist with no steps is sent back saying so', (prompts[1] ?? '').includes('input.todo') && on('d').data['title'] === 'Mine', prompts[1]?.slice(-300) ?? '');
  check('a checklist the model writes where another was keeps none of its ticks', rows('d', 'done').length === 0 && rows('d', 'todo').join() === 'One step', JSON.stringify(on('d').data));

  await ask('Only the charter');
  check('"Only the charter" is that card alone, laid out as one thing', areas() === 'guide.charter' && grid() === '1: a', `${areas()} — ${grid()}`);
  await ask('What is an action?');
  check('an answer that names no arrangement keeps the one on screen', on('a').action === 'guide.actions' && current().arrangement === 'single', `${areas()} — ${String(current().arrangement)}`);
  const actionsCard = on('a').id;
  await ask('and the charter beside it');
  check('a canvas kept stays the same canvas, in its area; what is new goes where the model puts it', on('a').id === actionsCard && areas() === 'guide.actions guide.charter' && grid() === '2: a b', `${areas()} — ${grid()}`);
  await ask('the charter first');
  check('the answer streams in: an area is placed while the rest of the reply is still being written', streamed > 0, String(streamed));
  check('a canvas the model keeps from another area moves there', areas() === 'guide.charter guide.actions', areas());

  prompts = [];
  await ask('keep what is not there');
  check(
    'keeping an area that is empty, or using one the arrangement does not have, is sent back saying so',
    (prompts[1] ?? '').includes('there is nothing in area f to keep') && (prompts[1] ?? '').includes('has no area c'),
    prompts[1]?.slice(-400) ?? '',
  );
  prompts = [];
  await ask('actions twice');
  check('the same card in two areas is sent back saying so', (prompts[1] ?? '').includes('show the same thing; show it once'), prompts[1]?.slice(-300) ?? '');

  const beforeWeatherCard = ids();
  const stackBeforeWeatherCard = total();
  prompts = [];
  runs.length = 0;
  await ask('Show me the weather card');
  check(
    'an answer refused three times leaves the screen as it was, and the line says so',
    prompts.length === 3 && ids() === beforeWeatherCard && total() === stackBeforeWeatherCard && said().includes('did not fit'),
    `${ids()} — ${said()}`,
  );
  check('a model run refused three times is recorded as failed, with its three steps', runs[1]?.outcome === 'failed' && runs[1]?.steps === 3 && runs[1]?.totalTokens === 330, JSON.stringify(runs[1]));

  await ask('Three cards, the last wide beneath');
  check('a layout the model wrote is the one the answer is laid out in', current().arrangement === 'written' && grid() === '2: a b c×2' && areas() === 'guide.nisc guide.shell guide.data', `${String(current().arrangement)} — ${grid()} — ${areas()}`);

  prompts = [];
  await ask('Two cards, in a grid of my own');
  check('a grid that names an area twice is sent back saying so, and the arrangement on screen stays', (prompts[1] ?? '').includes('the grid names an area twice') && current().arrangement === 'written' && areas() === 'guide.nisc guide.data', `${String(current().arrangement)} — ${areas()}`);

  const stacked = total();
  await openMenu('start');
  check('a screen from the dock, already in the stack, is gone back to, not stacked again', areas() === START && current().position === 1 && total() === stacked, `${areas()} — ${String(current().position)} of ${total()}`);

  await ask('What can you do?');
  check('words the model says are placed where it says, with no things to ask under them', on('a').action === 'answer.text' && on('a').data['title'] === 'What this app does' && rows('a', 'examples').length === 0 && areas() === 'answer.text', areas());

  await ask('the shell, and say what it is');
  check('words and canvases together, each in its area', areas() === 'answer.text guide.shell' && on('a').data['title'] === 'The shell', areas());

  await ask('Show the start screen');
  check('the model can answer with one of the app’s screens: gone back to where it is in the stack', current().screen === 'start' && current().position === 1, `${String(current().position)} of ${total()}`);

  const beforeWeather = ids();
  const stackBeforeWeather = total();
  await ask('What is the weather in Vienna?');
  check('an answer that changes nothing leaves the screen as it was, and adds nothing to the stack', ids() === beforeWeather && total() === stackBeforeWeather && said() === '', `${ids()} — ${String(total())} — ${said()}`);
  check('and the bar says what was asked, and why nothing changed', current().question === 'What is the weather in Vienna?' && current().response === 'Nothing in this app shows the weather.', JSON.stringify(current()).slice(0, 200));

  unreachable = true;
  runs.length = 0;
  await ask('Only the charter');
  check('a model that cannot be reached leaves the screen as it was, and the line says so', ids() === beforeWeather && said().includes('could not be reached'), said());
  check('and its run is recorded as failed: one step, nothing spent', runs[1]?.agentId === 'mira.compose' && runs[1]?.outcome === 'failed' && runs[1]?.steps === 1 && runs[1]?.totalTokens === 0, JSON.stringify(runs[1]));
  unreachable = false;

  runs.length = 0;
  await ask('Name it at length');
  check('a reply that does not fit the reply’s schema is refused: the screen stays, and the line says it did not fit', ids() === beforeWeather && said().includes('did not fit'), said());
  check('and its run is recorded as failed, with its three steps', runs[1]?.outcome === 'failed' && runs[1]?.steps === 3, JSON.stringify(runs[1]));

  session.dispatch('dock', { type: 'ui:click', ref: 'forward' });
  check('forward from the first screen is the answer after it, as it was', await until(() => current().position === 2 && current().question === 'What is the charter?' && on('e').action === 'guide.charter'), `position ${String(current().position)}, ${areas()}`);
  session.dispatch('dock', { type: 'ui:click', ref: 'back' });
  check('back is the first screen again', await until(() => current().position === 1 && current().screen === 'start'), `position ${String(current().position)}`);

  session.dispatch('dock', { type: 'ui:click', ref: 'stack' });
  const stack = current().stack ?? [];
  check(
    'the chip opens the stack: every answer, by its title or the screen it is',
    on('dock').data['listing'] === true && stack.length === total() && stack[0]?.label === SCREENS[0]?.label && stack[1]?.label === 'The charter' && stack[3]?.label === 'Make it yours',
    JSON.stringify(stack.slice(0, 3)),
  );
  session.dispatch('dock', { type: 'ui:click', ref: 'entry', payload: 4 });
  check('an answer picked from the stack is shown as it was, and the list closes', await until(() => current().position === 4 && areas() === 'guide.yours guide.checklist' && on('dock').data['listing'] === false), `${String(current().position)}, ${areas()}`);
} finally {
  server.close();
}

asked = [];
const { server: jevless } = await boot({
  models: {
    jev: {
      provider: 'scripted',
      model: 'jev',
      decide: async () => {
        throw new Error('Jev did not answer');
      },
    },
    chat: { provider: 'scripted', model: 'chat', llm: chat, timeoutMs: 5000 },
    missing: [],
  },
  runs: () => {},
});
try {
  const shells = jevless.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');
  const session = await shells.session(null, null);
  session.shell.flattenRenderTree(session.shell.getShellRenderTree());
  session.dispatch('dock', { type: 'ui:model', ref: 'text', payload: 'Only the charter' });
  session.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
  const first = (): string => AREAS.map((area) => session.shell.getState().canvases[area]?.active?.definitionId ?? '').filter((action) => action !== '').join(' ');
  check('when Jev cannot answer, the model answers alone', await until(() => first() === 'guide.charter'), first());
} finally {
  jevless.close();
}

const { server: keyless } = await boot({ models: { missing: ['GROQ_API_KEY'] }, runs: () => {} });
try {
  const shells = keyless.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');
  const session = await shells.session(null, null);
  session.shell.flattenRenderTree(session.shell.getShellRenderTree());
  session.dispatch('dock', { type: 'ui:model', ref: 'text', payload: 'Only the charter' });
  session.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
  const line = (): Record<string, unknown> => {
    const active = session.shell.getState().canvases['dock']?.active;
    return active === undefined ? {} : (session.shell.getRuntime(active.id)?.getData() ?? {});
  };
  check('with no key, the line names the key, and the screen stays as it was', await until(() => String(line()['error'] ?? '').includes('GROQ_API_KEY')), JSON.stringify(line()));
} finally {
  keyless.close();
}

console.log(failures === 0 ? '[pass] compose: all checks passed' : `[fail] compose: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
