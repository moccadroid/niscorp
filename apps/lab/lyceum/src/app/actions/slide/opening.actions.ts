import type { ActionDefinition, EndpointConfig } from '@niscorp/nova';
import {
  actionLayout,
  aloneLayout,
  answerLayout,
  compareLayout,
  demoLayout,
  looksLayout,
  novaLayout,
  openingTitleLayout,
  originLayout,
  problemLayout,
} from './opening.layouts';

// THE OPENING — up to the census. Where it started, the problem, our answer,
// and Nova: an action is data, your screen is data, who gets which action is
// a row, and any renderer can draw it. The slides carry the anchors; what is
// argued is in the notes (db/seed.ts).
//
// `pending` is a demo that is not built yet, drawn hatched.

const code = (...lines: string[]): string => lines.join('\n');
// Where people join — the deployment's, handed out by the server.
const ADDRESS = { url: '', host: '', ssh: '' };
const address: EndpointConfig = { fn: 'room.address', target: 'address' };

// A slide with nothing to load: its words are its data.
const still = (id: string, title: string, layout: ActionDefinition['layout'], data: Record<string, unknown>): ActionDefinition => ({
  id,
  title,
  data: { title, pending: '', ...data },
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

// The Q&A form: its source on the left, its layout rendered on the right (the
// same `sendLayout` a phone renders, placed on this slide).
export const actionSlide = still('slide.data', 'An action', actionLayout, {
  kicker: 'Nova',
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
});

export const xraySlide = still('slide.xray', 'Your screen is data.', demoLayout, {
  kicker: 'Nova',
  pending: 'The X-ray: everyone gets a tab that shows their own screen as the data it is — every action on it, and each one’s data.',
});

export const pushSlide = still('slide.clearance', 'Three of you just got a button.', demoLayout, {
  kicker: 'Nova',
  pending: 'Giving an action to three people from the controller, and taking it back. The button plays a sound.',
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

export const compareSlide = still('slide.compare', 'Isn’t this json-render?', compareLayout, {
  rows: [
    { what: 'The model writes', theirs: 'A view', ours: 'An action: data, endpoints, triggers, a layout' },
    { what: 'State lives', theirs: 'In the host app’s store', ours: 'In the action' },
    { what: 'It runs', theirs: 'In the browser', ours: 'Anywhere — here, on the server' },
  ],
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
  compareSlide,
];
