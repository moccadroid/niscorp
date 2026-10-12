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

const code = (...lines: string[]): string => lines.join('\n');
const ADDRESS = { url: '', host: '', ssh: '' };
const address: EndpointConfig = { fn: 'room.address', target: 'address' };

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
