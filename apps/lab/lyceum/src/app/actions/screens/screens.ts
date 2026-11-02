import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { sendLayout } from '@lyceum/app/actions/questions/send.layout';
import { pickRenderer } from '@lyceum/app/vex/renderer.entries';

// The Nova talk (talks/nova.md): the Q&A form everybody has is the screen a
// model rewrites and a broken layout is refused for; and each phone picks the
// framework that draws it.
export const FORM_CHANGED = 'form-changed';

const text = (words: string): LayoutNode => ({ component: 'Text', children: words });

// The form's layout with two mistakes in it: a button nothing answers, and a line that reads data the form doesn't have.
export const BROKEN_FORM: LayoutNode = {
  ...(sendLayout as { component: string; props: Record<string, unknown>; children: LayoutNode[] }),
  props: { areas: ['kick', 'to', 'field', 'go', 'vote', 'out'], rows: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto'] },
  children: [
    ...(sendLayout as { children: LayoutNode[] }).children,
    { component: 'Cell', props: { area: 'to' }, children: [text('A question for {{$.speaker}}')] },
    { component: 'Action', ref: 'vote', props: { area: 'vote', ink: 'paper', label: 'Vote' } },
  ],
};

// What the speaker can ask the model for with one press, each with the layout
// put up when the model has not answered in time; anything else is typed.
const sent = sendLayout as { component: string; props: Record<string, unknown>; children: LayoutNode[] };
const [kick, ...rest] = sent.children;
export const PREPARED: Readonly<Record<string, LayoutNode>> = {
  'Put the button above the field': { ...sent, props: { ...sent.props, areas: ['kick', 'go', 'field', 'out'] } },
  'Make the heading say “Ask me anything”': {
    ...sent,
    children: [{ ...(kick as Record<string, unknown>), children: [{ component: 'Label', children: 'Ask me anything' }] } as LayoutNode, ...rest],
  },
  'Put the field and the button side by side': { ...sent, props: { areas: ['kick kick', 'field go', 'out out'], cols: [3, 1], rows: ['auto', 'auto', 'auto'] } },
};
export const REQUESTS: readonly string[] = Object.keys(PREPARED);

const STATE = { rows: [], writing: false, request: '', how: '', attempts: 0, said: '' };

export const askTool: ActionDefinition = {
  id: 'tools.form-ask',
  title: 'Ask the model for a layout',
  data: { form: STATE, typed: '', error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'asks asks', 'typed send', 'now now', 'back back'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Ask the model for a layout' }] },
      { component: 'Cell', props: { area: 'asks' }, children: [{ component: 'Rows', props: { rows: '$.form.rows', rowKey: 'request', rowRef: 'ask', columns: [{ label: 'Press one, or type what the room calls out', key: 'request' }] } }] },
      { component: 'Field', model: '$.typed', props: { area: 'typed', placeholder: 'How the form should look' } },
      { component: 'Action', ref: 'send', props: { area: 'send', ink: 'signal', label: 'Send' } },
      {
        component: 'Cell',
        props: { area: 'now' },
        children: [
          { if: '$.form.writing', then: text('Writing a layout for “{{$.form.request}}”…') },
          { if: { $eq: ['$.form.how', 'model'] }, then: text('The model’s layout is up, taken on try {{$.form.attempts}}.') },
          { if: { $eq: ['$.form.how', 'prepared'] }, then: text('The model was slow: the prepared layout is up.') },
          { if: '$.form.said', then: text('Not taken: {{$.form.said}}') },
          { if: '$.error', then: text('{{$.error.message}}') },
        ],
      },
      { component: 'Action', ref: 'back', props: { area: 'back', ink: 'paper', label: 'Put the form back as it was' } },
    ],
  },
  endpoints: { state: { fn: 'form.state', target: 'form' }, ask: { fn: 'form.layout', errorTarget: 'error' }, back: { fn: 'form.put-back', errorTarget: 'error' } },
  lifecycle: { mount: [{ call: 'state' }] },
  triggers: [
    { event: 'ui:click', ref: 'ask', do: [{ set: 'error', value: '' }, { set: 'request', value: '@event.payload' }, { call: 'ask' }] },
    { event: 'ui:click', ref: 'send', do: [{ set: 'error', value: '' }, { set: 'request', value: '{{$.typed}}' }, { set: 'typed', value: '' }, { call: 'ask' }] },
    { event: 'ui:click', ref: 'back', do: [{ set: 'error', value: '' }, { call: 'back' }] },
    { message: FORM_CHANGED, do: [{ call: 'state' }] },
  ],
};

// What the speaker types lands in the projector's form as they type it.
export const typeTool: ActionDefinition = {
  id: 'tools.form-type',
  title: 'Type into the projector’s form',
  data: { draft: '', error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick', 'field', 'said'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Type into the projector’s form' }] },
      { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Half a question' } },
      { component: 'Cell', props: { area: 'said' }, children: [{ if: '$.error', then: text('{{$.error.message}}') }] },
    ],
  },
  endpoints: { type: { fn: 'form.type', errorTarget: 'error' } },
  triggers: [{ event: 'ui:model', ref: 'draft', do: [{ call: 'type' }] }],
};

export const brokenTool: ActionDefinition = {
  id: 'tools.form-broken',
  title: 'A layout with two mistakes',
  data: { error: '', done: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick', 'press', 'said'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'A layout with two mistakes' }] },
      { component: 'Action', ref: 'press', props: { area: 'press', ink: 'alert', label: 'Hand Nova the broken layout' } },
      { component: 'Cell', props: { area: 'said' }, children: [{ if: '$.error', then: text('{{$.error.message}}') }, { if: '$.done', then: text('{{$.done}}') }] },
    ],
  },
  endpoints: { press: { fn: 'form.broken', target: 'done', errorTarget: 'error' } },
  triggers: [{ event: 'ui:click', ref: 'press', do: [{ set: 'error', value: '' }, { set: 'done', value: '' }, { call: 'press' }] }],
};

// On a phone: the framework that draws it, picked by its owner.
const FRAMEWORKS = [
  { ref: 'react', label: 'React' },
  { ref: 'vue', label: 'Vue' },
  { ref: 'svelte', label: 'Svelte' },
  { ref: 'angular', label: 'Angular' },
  { ref: 'dom', label: 'Plain DOM' },
  { ref: 'text', label: 'Terminal' },
] as const;

export const lookAction: ActionDefinition = {
  id: 'screens.look',
  title: 'Draw my phone with',
  description: 'Pick the framework that draws your own phone.',
  data: { error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'react vue', 'svelte angular', 'dom text', 'out out'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Draw my phone with' }] },
      ...FRAMEWORKS.map((framework): LayoutNode => ({ component: 'Action', ref: framework.ref, props: { area: framework.ref, ink: 'paper', label: framework.label } })),
      { if: '$.error', then: { component: 'Cell', props: { area: 'out' }, children: [text('{{$.error.message}}')] } },
    ],
  },
  endpoints: Object.fromEntries(
    FRAMEWORKS.map((framework) => [framework.ref, { url: '/api/vex', method: 'POST', request: { fingerprint: pickRenderer.fingerprint, context: { renderer: framework.ref } }, errorTarget: 'error' }]),
  ),
  triggers: FRAMEWORKS.map((framework) => ({ event: 'ui:click', ref: framework.ref, do: [{ set: 'error', value: '' }, { call: framework.ref }] })),
};
