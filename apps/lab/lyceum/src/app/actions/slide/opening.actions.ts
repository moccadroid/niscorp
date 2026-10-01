import type { ActionDefinition, EndpointConfig } from '@niscorp/nova';
import { allRenderers } from '@lyceum/app/vex/renderer.entries';
import {
  actionLayout,
  aloneLayout,
  answerLayout,
  differenceLayout,
  looksLayout,
  terminalLayout,
  novaLayout,
  openingTitleLayout,
  originLayout,
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
  data: { title: 'nisc', line: 'Apps as checked JSON.', address: ADDRESS },
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

export const problemSlide = still('slide.problem', 'Models write code faster than anyone can review it.', aloneLayout, {});

export const answerSlide = still('slide.answer', 'A program checks it. Not a person.', answerLayout, {
  kicker: 'Our answer',
  line: '',
});

export const novaSlide = still('slide.nova', 'Nova', novaLayout, {
  claim: 'The UI as JSON.',
  // The Send button of the Q&A form, as it is in send.layout.ts.
  json: code(
    '{',
    "  component: 'Action',",
    "  ref: 'send_btn',",
    '  props: {',
    "    area: 'go',",
    "    ink: 'alert',",
    "    label: 'Send →',",
    '  },',
    '}',
  ),
});

// The Q&A form: its source in the middle (questions/send.action.ts, with what
// does not matter here elided as …), its layout rendered on the right (the same
// `sendLayout` a phone renders, placed on this slide). The marked lines follow
// a click: the data, the layout, the endpoint, the button's trigger, the call.
export const actionSlide = still('slide.data', 'An action', actionLayout, {
  kicker: 'Nova',
  file: 'send.action.ts',
  code: code(
    'export const questionSendAction = {',
    "  id: 'questions.send',",
    "  data: { draft: '', sent: false, … },",
    '  layout: sendLayout,',
    '  endpoints: {',
    "    post_question: { url: '/api/vex', … },",
    '  },',
    '  triggers: [{',
    "    event: 'ui:click',",
    "    ref: 'send_btn',",
    '    do: [',
    "      { set: 'error', value: '' },",
    "      { call: 'post_question', onSuccess: [ … ] },",
    '    ],',
    '  }],',
    '};',
  ),
  marked: [3, 4, 6, 10, 13],
  draft: '',
  sent: false,
  error: '',
});

export const xraySlide = still('slide.xray', 'Your screen, as JSON.', xrayLayout, {});

export const pushSlide = still('slide.clearance', 'Three of you just got a button.', threeLayout, {});

// Which renderer draws which screen, live: the same rows the controller's
// switch writes, read reactively, so a press lights its column at once.
export const looksSlide: ActionDefinition = {
  id: 'slide.looks',
  title: 'One screen, any renderer.',
  data: {
    title: 'One screen, any renderer.',
    kinds: [
      { area: 'dom', name: 'DOM', index: 0 },
      { area: 'react', name: 'React', index: 1 },
      { area: 'vue', name: 'Vue', index: 2 },
    ],
    rows: [],
  },
  layout: looksLayout,
  endpoints: { rows: { url: '/api/vex', method: 'POST', request: { fingerprint: allRenderers.fingerprint, context: {} }, target: 'rows' } },
  lifecycle: { mount: [{ call: 'rows' }] },
  triggers: [],
};

// The same app over SSH: the command to type, from the deployment.
export const terminalSlide: ActionDefinition = {
  id: 'slide.terminal',
  title: 'The same app, in a terminal.',
  data: { title: 'The same app, in a terminal.', address: ADDRESS },
  layout: terminalLayout,
  endpoints: { address },
  lifecycle: { mount: [{ call: 'address' }] },
  triggers: [],
};

export const questionSlide = still('slide.compare', 'Isn’t this json-render?', questionLayout, {});

export const behaviourSlide = still('slide.behaviour', 'A button', differenceLayout, {
  kicker: 'Difference 1',
  theirs: 'Calls your function.',
  ours: 'JSON steps.',
  oursInk: 'ink',
  code: code(
    '{',
    "  event: 'ui:click',",
    "  ref: 'send_btn',",
    '  do: [',
    "    { set: 'error', value: '' },",
    "    { call: 'post_question', onSuccess: [ … ] },",
    '  ],',
    '}',
  ),
  marked: [3, 6],
});

export const stateSlide = still('slide.state', 'State', differenceLayout, {
  kicker: 'Difference 2',
  theirs: 'In your app’s store.',
  ours: 'In the action.',
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
  terminalSlide,
  questionSlide,
  behaviourSlide,
  stateSlide,
];
