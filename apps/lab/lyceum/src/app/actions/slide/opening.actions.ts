import type { ActionDefinition, EndpointConfig } from '@niscorp/nova';
import {
  actionLayout,
  aloneLayout,
  answerLayout,
  differenceLayout,
  looksLayout,
  novaLayout,
  openingTitleLayout,
  originLayout,
  problemLayout,
  questionLayout,
  threeLayout,
  xrayLayout,
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
  // The Send button of the Q&A form, as it is in send.layout.ts.
  json: code(
    '{',
    "  component: 'Action',",
    "  ref: 'send',",
    '  props: {',
    "    area: 'go',",
    "    ink: 'alert',",
    "    label: 'Send →',",
    '  },',
    '}',
  ),
});

// The Q&A form: its source in the middle, its layout rendered on the right
// (the same `sendLayout` a phone renders, placed on this slide). The marked
// lines follow a click: the trigger runs `send`, which calls the endpoint.
export const actionSlide = still('slide.data', 'An action', actionLayout, {
  kicker: 'Nova',
  file: 'send.action.ts',
  code: code(
    'const send = [',
    "  { set: 'error', value: '' },",
    "  { call: 'send', onSuccess: [ … ] },",
    '];',
    '',
    'export const questionSendAction = {',
    "  id: 'questions.send',",
    "  data: { draft: '', sent: false, … },",
    '  layout: sendLayout,',
    '  endpoints: {',
    "    send: { url: '/api/vex', … },",
    '  },',
    '  triggers: [',
    "    { event: 'ui:click', ref: 'send',",
    '      do: send },',
    "    { event: 'ui:key', key: 'Enter',",
    '      do: send },',
    '  ],',
    '};',
  ),
  marked: [3, 8, 9, 10, 14, 15],
  draft: '',
  sent: false,
  error: '',
});

export const xraySlide = still('slide.xray', 'Your screen is data.', xrayLayout, {});

export const pushSlide = still('slide.clearance', 'Three of you just got a button.', threeLayout, {});

export const looksSlide: ActionDefinition = {
  id: 'slide.looks',
  title: 'The server sends data. Your phone draws it.',
  data: { kicker: 'Nova', title: 'The server sends data. Your phone draws it.', address: ADDRESS },
  layout: looksLayout,
  endpoints: { address },
  lifecycle: { mount: [{ call: 'address' }] },
  triggers: [],
};

export const questionSlide = still('slide.compare', 'Isn’t this json-render?', questionLayout, {});

export const behaviourSlide = still('slide.behaviour', 'What a button does', differenceLayout, {
  kicker: 'Difference one',
  theirs: 'Calls a function in your app.',
  ours: 'Is data.',
  oursInk: 'ink',
  code: code(
    "{ event: 'ui:click', ref: 'send', do: send }",
    '',
    'const send = [',
    "  { set: 'error', value: '' },",
    "  { call: 'send', onSuccess: [ … ] },",
    '];',
  ),
  marked: [1, 5],
});

export const stateSlide = still('slide.state', 'Where the state lives', differenceLayout, {
  kicker: 'Difference two',
  theirs: 'In your app’s store.',
  ours: 'In the action. So it runs anywhere.',
  oursInk: 'signal',
  code: '',
  marked: [],
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
