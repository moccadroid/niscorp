import type { ActionDefinition, EndpointConfig } from '@niscorp/nova';
import { assistantAction } from '@lyceum/app/actions/assistant/assistant.action';
import { allRenderers } from '@lyceum/app/vex/renderer.entries';
import {
  actionLayout,
  aloneLayout,
  answerLayout,
  looksLayout,
  mirrorLayout,
  terminalLayout,
  novaLayout,
  openingTitleLayout,
  originLayout,
  partsLayout,
  questionLayout,
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

// The timer is asked for on the controller, and the room watches it here: the
// speaker's assistant, mirrored (server/mirroring.ts). This slide's data is the
// assistant's own data — copied whenever the server says it changed — drawn
// with the assistant's own layout. It only shows: nothing on it can be pressed.
const followAssistant = [{ call: 'mirror', onSuccess: Object.keys(assistantAction.data ?? {}).map((key) => ({ set: key, value: `$.mirror.${key}` })) }];
export const timerSlide: ActionDefinition = {
  id: 'slide.timer',
  title: 'First, a timer.',
  data: { ...assistantAction.data, title: 'First, a timer.', mirror: {} },
  layout: mirrorLayout,
  endpoints: { mirror: { fn: 'assistant.mirror', target: 'mirror' } },
  lifecycle: { mount: followAssistant },
  triggers: [{ message: 'assistant-mirror', do: followAssistant }],
};

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
    "      { call: 'post_question', … },",
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

// SSH into it: the one command, the deployment's (Railway's TCP proxy).
export const terminalSlide = still('slide.terminal', 'SSH into it.', terminalLayout, {
  ssh: 'ssh -p 26466 sakura.proxy.rlwy.net',
});

export const questionSlide = still('slide.compare', 'Isn’t this json-render?', questionLayout, {});

export const partsSlide = still('slide.parts', 'json-render ≈ Nova ∈ nisc', partsLayout, {});

export const OPENING_SLIDES: readonly ActionDefinition[] = [
  titleSlide,
  timerSlide,
  originSlide,
  problemSlide,
  answerSlide,
  novaSlide,
  actionSlide,
  xraySlide,
  looksSlide,
  terminalSlide,
  questionSlide,
  partsSlide,
];
