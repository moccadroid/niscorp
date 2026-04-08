import type { ActionStory } from '../../story-types';

export const inputModelStory: ActionStory = {
  id: 'input-model',
  name: 'Input + model',
  description:
    'Demonstrates two-way `model` binding on Input. Type into the field — keystrokes write through to `$.name` in the data store, which the greeting Text reads via a `{{$.name}}` template, so the heading updates live as you type.',
  kind: 'action',
  category: 'Bindings',
  action: {
    id: 'input-model',
    data: { name: '' },
    layout: {
      component: 'Stack',
      props: { direction: 'column', gap: 16, padding: 24 },
      children: [
        {
          component: 'Text',
          props: { size: 'lg' },
          children: 'Hello, {{$.name}}!',
        },
        {
          component: 'Input',
          model: '$.name',
          props: { placeholder: 'Type your name' },
        },
      ],
    },
  },
  expected: { textIncludes: ['Hello, !'] },
};
