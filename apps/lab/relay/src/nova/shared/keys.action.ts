import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

// The API-keys modal body. Two provider keys, two-way bound to the action data
// (the modal chrome + title + ✕ come from the `modal` fragment). Same form shape
// as the domain forms — masked inputs + a Cancel/Save footer.
const keysLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 13 },
  children: [
    { component: 'Input', model: '$.openrouter', props: { label: 'OpenRouter key', type: 'password', placeholder: 'sk-or-…' } },
    { component: 'Input', model: '$.groq', props: { label: 'Groq key', type: 'password', placeholder: 'gsk_…' } },
    {
      component: 'Text',
      props: { size: 'sm', color: 'mute' },
      children: 'OpenRouter runs Ray + the action builder. Groq runs the data + support agents. Stored in this browser only.',
    },
    {
      component: 'FormFoot',
      children: [
        { component: 'Button', ref: 'cancel', props: { variant: 'default' }, children: 'Cancel' },
        { component: 'Button', ref: 'confirm', props: { variant: 'primary' }, children: 'Save' },
      ],
    },
  ],
};

// The API-keys modal. Loads the current keys on mount, saves both via local
// functions (keys.load / keys.save). Opened on the `modal` canvas with the
// `modal` fragment — the 🔑 button pushes it.
export const keysAction: ActionDefinition = {
  id: 'keys',
  data: { modalTitle: 'API keys', openrouter: '', groq: '', loaded: {} },
  layout: keysLayout,
  endpoints: {
    load: { fn: 'keys.load', target: 'loaded' },
    save: { fn: 'keys.save' },
  },
  lifecycle: {
    mount: [
      {
        call: 'load',
        onSuccess: [
          { set: 'openrouter', value: '$.loaded.openrouter' },
          { set: 'groq', value: '$.loaded.groq' },
        ],
      },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'confirm', do: [{ call: 'save', onSuccess: [{ pop: true }] }] },
  ],
};
