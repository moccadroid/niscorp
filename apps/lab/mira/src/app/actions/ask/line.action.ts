import type { ActionDefinition, Step } from '@niscorp/nova';

// The answer does not come back here: the server sends it to the bar, which places it.
const ask: Step[] = [
  { set: 'asking', value: true },
  { set: 'error', value: '' },
  {
    call: 'ask',
    onSuccess: [{ set: 'asking', value: false }, { set: 'text', value: '' }],
    onError: [{ set: 'asking', value: false }, { set: 'error', value: '{{@error.message}}' }],
  },
];

export const lineAction: ActionDefinition = {
  id: 'ask.line',
  title: 'Ask',
  description: 'The line a person types into. Enter, or Send, asks; the answer is a screen.',
  data: { text: '', asking: false, error: '' },
  layout: {
    component: 'Prompt',
    children: [
      { component: 'Input', ref: 'text', model: '$.text', props: { placeholder: 'What would you like to see?', clearOnEnter: true } },
      { component: 'Button', ref: 'send', props: { label: { $if: '$.asking', $then: 'Asking…', $else: 'Send' } } },
      { if: '$.error', then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error}}' } },
    ],
  },
  endpoints: { ask: { fn: 'ask' } },
  triggers: [
    { event: 'ui:key', key: 'Enter', ref: 'text', do: ask },
    { event: 'ui:click', ref: 'send', do: ask },
    { message: 'ask', do: [{ set: 'text', value: '@event.payload' }, ...ask] },
  ],
};
