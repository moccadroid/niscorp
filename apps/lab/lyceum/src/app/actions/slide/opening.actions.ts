import type { ActionDefinition, EndpointConfig } from '@niscorp/nova';
import {
  actionLayout,
  aloneLayout,
  answerLayout,
  looksLayout,
  novaLayout,
  openingTitleLayout,
  originLayout,
  pointCodeLayout,
  pointLayout,
  problemLayout,
} from './opening.layouts';

// THE OPENING — up to the census. Where it started, the problem, our answer,
// and Nova: an action is data, your screen is data, who gets which action is
// a row, and any renderer can draw it. The slides carry the anchors; what is
// argued is in the notes (db/seed.ts).
//
// A demo that is not built yet is hatched on the controller, not here: its
// cue says what should happen (actions/tools/cue.actions.ts).

const code = (...lines: string[]): string => lines.join('\n');
// Where people join — the deployment's, handed out by the server.
const ADDRESS = { url: '', host: '', ssh: '' };
const address: EndpointConfig = { fn: 'room.address', target: 'address' };

// A slide with nothing to load: its words are its data.
const still = (id: string, title: string, layout: ActionDefinition['layout'], data: Record<string, unknown>): ActionDefinition => ({
  id,
  title,
  data: { title, ...data },
  layout,
  triggers: [],
});

export const titleSlide: ActionDefinition = {
  id: 'slide.title',
  title: 'nisc',
  data: { title: 'nisc', line: 'An architecture for applications that language models write and operate.', address: ADDRESS },
  layout: openingTitleLayout,
  endpoints: { address },
  lifecycle: { mount: [{ call: 'address' }] },
  triggers: [],
};

export const timerSlide = still('slide.timer', 'First, a timer.', aloneLayout, {});

export const originSlide = still('slide.origin', 'GPT-3 could not write a React app.', originLayout, {
  kicker: '2020',
  not: 'GPT-3 could not write a React app.',
  did: 'It could fill in a JSON schema.',
});

export const problemSlide = still('slide.problem', 'Models write code faster than anyone can review it.', problemLayout, {
  usual: { label: 'One answer', text: 'Make the output small enough for a person to read — Lowdefy: config that humans can review.' },
});

export const answerSlide = still('slide.answer', 'Make it something a program can check.', answerLayout, {
  kicker: 'Our answer',
  line: 'The UI, the queries, the permissions, the automations: each one a document with a schema.',
});

export const novaSlide = still('slide.nova', 'Nova', novaLayout, {
  claim: 'The UI is data.',
  steps: [
    { area: 'one', n: '1', title: 'A model writes it', text: 'An action, as JSON: data, endpoints, triggers, a layout.' },
    { area: 'two', n: '2', title: 'A schema checks it', text: 'Before anything runs.' },
    { area: 'three', n: '3', title: 'Nova runs it', text: 'A renderer draws it, on any screen.' },
  ],
});

// The Q&A form: its source, whole, on the left; its layout rendered on the
// right (the same `sendLayout` a phone renders, placed on this slide).
export const actionSlide = still('slide.data', 'An action', actionLayout, {
  kicker: 'Nova',
  file: 'send.action.ts',
  code: code(
    'const send = [',
    "  { set: 'error', value: '' },",
    "  { call: 'send', onSuccess: [{ set: 'draft', value: '' }, …] },",
    '];',
    '',
    'export const questionSendAction = {',
    "  id: 'questions.send',",
    "  data: { draft: '', sent: false, error: '' },",
    '  layout: sendLayout,',
    '  endpoints: {',
    "    send: { url: '/api/vex', method: 'POST', request: {",
    "      fingerprint: 'questions/send',",
    "      context: { text: { $ref: '$.draft' } } } },",
    '  },',
    '  triggers: [',
    "    { event: 'ui:click', ref: 'send', do: send },",
    "    { event: 'ui:key', ref: 'draft', key: 'Enter', do: send },",
    '  ],',
    '};',
  ),
  marked: [3, 8, 9, 10, 16],
  draft: '',
  sent: false,
  error: '',
});

export const xraySlide = still('slide.xray', 'Your screen is data.', pointLayout, {
  kicker: 'Nova',
  line: 'Nothing on it is code. You can read every part of it — and so can a program, or a model.',
});

export const pushSlide = still('slide.clearance', 'Three of you just got a button.', pointLayout, {
  kicker: 'Nova',
  line: 'Nobody else did. It is not hidden from you — it was never sent. Who gets which action is decided per person, on the server.',
});

export const looksSlide: ActionDefinition = {
  id: 'slide.looks',
  title: 'The server sends data. Your phone draws it.',
  data: { kicker: 'Nova', title: 'The server sends data. Your phone draws it.', address: ADDRESS },
  layout: looksLayout,
  endpoints: { address },
  lifecycle: { mount: [{ call: 'address' }] },
  triggers: [],
};

export const questionSlide = still('slide.compare', 'Isn’t this json-render?', pointLayout, {
  kicker: 'The obvious question',
  line: 'Or Google’s A2UI. Good projects, heading the same way: a model writes JSON, a renderer draws it.',
});

export const behaviourSlide = still('slide.behaviour', 'Behaviour is data too.', pointCodeLayout, {
  kicker: 'Nova, unlike them',
  line: 'In json-render, a button calls a function in your app. In Nova, what it does is data — checked before it runs.',
  file: 'send.action.ts',
  code: code(
    'const send = [',
    "  { set: 'error', value: '' },",
    "  { call: 'send', onSuccess: [ … ] },",
    '];',
    '',
    "{ event: 'ui:click', ref: 'send', do: send },",
  ),
  marked: [3, 6],
});

export const stateSlide = still('slide.state', 'The state lives in the action.', pointLayout, {
  kicker: 'Nova, unlike them',
  line: 'Not in your app’s store. So an action runs anywhere — a browser, a server, a terminal. That is why the last three slides worked.',
});

export const OPENING_SLIDES: readonly ActionDefinition[] = [
  titleSlide,
  timerSlide,
  originSlide,
  problemSlide,
  answerSlide,
  novaSlide,
  actionSlide,
  xraySlide,
  pushSlide,
  looksSlide,
  questionSlide,
  behaviourSlide,
  stateSlide,
];
