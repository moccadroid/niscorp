import type { ActionDefinition, EndpointConfig } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { timerNext } from '@lyceum/app/vex/timer.entries';
import {
  actionLayout,
  compareLayout,
  gateLayout,
  looksLayout,
  openingTitleLayout,
  prepareLayout,
  problemLayout,
  pushLayout,
  screenLayout,
  shellLayout,
  timerLayout,
} from './opening.layouts';

// THE OPENING — the talk up to the census. Nova is the centre of it: an action
// is data, a shell holds a person's actions, and what that gives you follows —
// pushing actions to people, no gate in the front end, one tree drawn by any
// kit, an assistant that reads the screen, a model that fills in a form for a
// person to send. Every claim here is about code in this folder.
//
// `pending` is a beat that is not built yet, drawn hatched.

const read = (fingerprint: string, target: string): EndpointConfig => ({ url: '/api/vex', method: 'POST', request: { fingerprint, context: {} }, target });
const say = (...texts: string[]): { text: string }[] => texts.map((text) => ({ text }));
const code = (...lines: string[]): string => lines.join('\n');
const COUNTS = { joined: 0, assigned: 0, unassigned: 0 };
// Where people join — the deployment's, handed out by the server.
const ADDRESS = { url: '', host: '', ssh: '' };
const address: EndpointConfig = { fn: 'room.address', target: 'address' };

// 1
export const titleSlide: ActionDefinition = {
  id: 'slide.title',
  title: 'nisc',
  data: {
    kicker: 'A live talk',
    title: 'nisc',
    lines: ['An architecture for applications that language models write and operate.', 'This talk runs on it. Join on your phone — laptops too.'],
    counts: COUNTS,
    address: ADDRESS,
  },
  layout: openingTitleLayout,
  endpoints: { counts: read(memberCounts.fingerprint, 'counts'), address },
  lifecycle: { mount: [{ call: 'counts' }, { call: 'address' }] },
  triggers: [],
};

// 2 — the countdown is the newest saved timer's, read as the stage: a timer
// saved on the controller starts here with nobody announcing it.
export const timerSlide: ActionDefinition = {
  id: 'slide.timer',
  title: 'A timer, written by a model',
  data: {
    kicker: 'Before anything else',
    title: 'A timer, written by a model',
    lines: say(
      'The assistant was asked for it in words. It answered with a tide reflex: a JSON document, checked against a schema, read before it was saved.',
      'Saved, it is a row. It moves this talk to its last slide. We come back to it at the end.',
    ),
    timer: { timer_id: '', intent: '', due_at: '' },
  },
  layout: timerLayout,
  endpoints: { timer: read(timerNext.fingerprint, 'timer') },
  lifecycle: { mount: [{ call: 'timer' }] },
  triggers: [],
};

// 3
export const problemSlide: ActionDefinition = {
  id: 'slide.problem',
  title: 'Models write code faster than anyone can review it',
  data: {
    kicker: 'The problem',
    title: 'Models write code faster than anyone can review it',
    one: { label: 'Answer one', title: 'Make the output small enough for a person to read', text: 'Config instead of code, "that humans can review" — Lowdefy’s pitch.' },
    two: { label: 'Answer two', title: 'Make the output a document a program can check', text: 'A schema at every boundary, nothing executable in a string. This talk.' },
    root: 'Where it started: in 2020 GPT-3 could not write a React app. It could fill in a JSON schema, most of the time.',
  },
  layout: problemLayout,
  triggers: [],
};

// 4 — the Q&A form: its source on the left, its layout rendered on the right
// (the same `sendLayout` a phone renders, placed on this slide).
export const actionSlide: ActionDefinition = {
  id: 'slide.data',
  title: 'An action',
  data: {
    kicker: 'Nova',
    title: 'An action',
    lines: say(
      'The Q&A form on your phone is this object. data is what it holds, endpoints how data gets in and out — here a vex write — triggers what an event does, layout a tree of named components.',
      'It is checked against a Zod schema before it runs. The code sits behind the endpoints.',
    ),
    file: 'app/actions/questions/send.action.ts, abridged',
    code: code(
      'export const questionSendAction = {',
      "  id: 'questions.send',",
      "  data: { draft: '', sent: false, … },",
      '  layout: sendLayout,',
      '  endpoints: {',
      '    send: {',
      "      url: '/api/vex', method: 'POST',",
      '      request: {',
      "        fingerprint: 'questions/send',",
      '        context: {',
      "          text: { $ref: '$.draft' } },",
      '      } },',
      '  },',
      '  triggers: [',
      "    { event: 'ui:click', ref: 'send', … },",
      "    { event: 'ui:key', key: 'Enter', … },",
      '  ],',
      '};',
    ),
    marked: [3, 4, 5, 14],
    draft: '',
    sent: false,
    error: '',
  },
  layout: actionLayout,
  triggers: [],
};

// 5
export const shellSlide: ActionDefinition = {
  id: 'slide.shell',
  title: 'A shell holds your actions',
  data: {
    kicker: 'Nova',
    title: 'A shell holds your actions',
    lines: say(
      'No pages. A form, a list, a dialog and a tab bar are all actions on canvases. The shell is data too: which actions, where, with what data.',
      'Nova owns each action’s state, so a shell can live anywhere — inside an app you already have, alone in a browser, or on a server. Here it is on the server, one per person.',
    ),
  },
  layout: shellLayout,
  triggers: [],
};

// 6
export const compareSlide: ActionDefinition = {
  id: 'slide.compare',
  title: 'Isn’t this json-render?',
  data: {
    kicker: 'The obvious question',
    title: 'Isn’t this json-render?',
    rows: [
      { what: 'The model writes', theirs: 'A view: components from a catalog', ours: 'An action: data, endpoints, triggers, a layout' },
      { what: 'State', theirs: 'The host app’s store — Redux, Zustand, …', ours: 'Owned by each action instance' },
      { what: 'Behaviour', theirs: 'Handlers: functions in the host app', ours: 'Steps in a closed grammar; code behind endpoints' },
      { what: 'Runs', theirs: 'In the browser, in the host', ours: 'Anywhere a shell does — here, on the server' },
    ],
    lines: say('They are good, and they are converging on the same idea. The difference that matters: nova owns the state, so the same action runs anywhere and any renderer can draw it. The next three slides depend on that.'),
  },
  layout: compareLayout,
  triggers: [],
};

// 7
export const pushSlide: ActionDefinition = {
  id: 'slide.push',
  title: 'Pushing actions',
  data: {
    kicker: 'Look at your phone',
    title: 'Pushing actions',
    counts: COUNTS,
    targets: [
      { area: 'all', ink: 'signal', label: 'Everyone', title: 'A colour', text: 'Every phone here turns green.' },
      { area: 'group', ink: 'live', label: 'A group', title: 'A header', text: 'Half the room gets a new line across the top.' },
      { area: 'one', ink: 'alert', label: 'One person', title: 'A button', text: 'One phone gets an action nobody else has.' },
    ],
    lines: say('Each of these is a row: which role a person holds, what an action carries. The shell follows the row — no reload, no deploy.'),
    pending: 'The controller’s panel for pushing, and the colour, header and button actions. What exists: assigning a role live, and tabs that follow it without a reload.',
  },
  layout: pushLayout,
  endpoints: { counts: read(memberCounts.fingerprint, 'counts') },
  lifecycle: { mount: [{ call: 'counts' }] },
  triggers: [],
};

// 8
export const gateSlide: ActionDefinition = {
  id: 'slide.clearance',
  title: 'There is no front-end gate',
  data: {
    kicker: 'Compare with your neighbour',
    title: 'There is no front-end gate',
    lines: say(
      'An action you do not hold is not hidden and not disabled. It is not in your shell, so nothing about it is sent to your phone.',
      'On a laptop: open devtools and read the websocket frames.',
      'json-render gates with visible conditions in the browser; most apps ship everything and hide it behind an if.',
    ),
    pending: 'The button itself (slide 7).',
  },
  layout: gateLayout,
  triggers: [],
};

// 9
export const looksSlide: ActionDefinition = {
  id: 'slide.looks',
  title: 'The server sends a tree. A kit draws it.',
  data: {
    kicker: 'Watch your phone',
    title: 'The server sends a tree. A kit draws it.',
    address: ADDRESS,
    lines: say(
      'One row changes, and every screen swaps its kit. The trees do not change; open devtools — nothing else was sent.',
      'A kit is a set of components against a props contract, and the contract is versioned like a table.',
    ),
  },
  layout: looksLayout,
  endpoints: { address },
  lifecycle: { mount: [{ call: 'address' }] },
  triggers: [],
};

// 10 — the words are what the assistant was handed for a real phone, cut
// short: the text kit's drawing of it, and the actions the charter gives them.
export const screenSlide: ActionDefinition = {
  id: 'slide.screen',
  title: 'It can read your screen',
  data: {
    kicker: 'On your phone: the assistant',
    title: 'It can read your screen',
    lines: say(
      'Ask it what is on your screen. It is handed the tree your phone was sent, drawn as text, and the actions you hold with their input schemas.',
      'No screenshot, no scraped DOM, no description kept in step by hand. It can only offer what you hold.',
    ),
    seen: code(
      'ON THEIR SCREEN',
      '── self ──',
      'Leon Moreau',
      'Waiting',
      '── tabs ──',
      '[button: Card]',
      '[button: Q&A]',
      '[button: Assistant]',
      '',
      'THEIR ACTIONS',
      '- member.card — Your ID card',
      '- questions.mine — Your questions',
      '- questions.send — Send the speaker',
      '  a question: sent only when they',
      '  press Send. Pre-fill: draft',
    ),
    marked: [1, 10, 15],
  },
  layout: screenLayout,
  triggers: [],
};

// 11
export const prepareSlide: ActionDefinition = {
  id: 'slide.prepare',
  title: 'The model fills in the form. A person sends it.',
  data: {
    kicker: 'Drive-throughs',
    title: 'The model fills in the form. A person sends it.',
    lines: say(
      'Ask your assistant to send the speaker a question. It never writes anything: it opens the form you hold, filled in.',
      'Because what it prepared is data, a second, small model could check it before it is shown.',
    ),
    draft: 'Will the slides be online after the talk?',
    sent: false,
    error: '',
    pending: 'A second model checking what the assistant prepared.',
  },
  layout: prepareLayout,
  triggers: [],
};

export const OPENING_SLIDES: readonly ActionDefinition[] = [
  titleSlide,
  timerSlide,
  problemSlide,
  actionSlide,
  shellSlide,
  compareSlide,
  pushSlide,
  gateSlide,
  looksSlide,
  screenSlide,
  prepareSlide,
];
