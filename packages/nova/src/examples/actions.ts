import type { NovaExample } from './example.types';

// Actions at work: data, a layout over it, and triggers. Each says what is
// pressed, and what the action then holds and says.
export const ACTION_EXAMPLES: readonly NovaExample[] = [
  {
    id: 'counter',
    group: 'actions',
    title: 'Counter',
    description: 'An action with `count` in its data and two triggers. A press on a button is a `ui:click` on its `ref`; the trigger for that `ref` changes the data, and the text over it is drawn again.',
    action: {
      id: 'counter',
      data: { count: 0 },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: 'Count: {{$.count}}' },
          { component: 'Button', ref: 'more', children: 'One more' },
          { component: 'Button', ref: 'fewer', children: 'One fewer' },
        ],
      },
      triggers: [
        { event: 'ui:click', ref: 'more', do: [{ increment: 'count' }] },
        { event: 'ui:click', ref: 'fewer', do: [{ decrement: 'count' }] },
      ],
    },
    presses: [{ ref: 'more' }, { ref: 'more' }, { ref: 'fewer' }],
    expected: { says: ['Count: 1', 'One more', 'One fewer'], data: { count: 1 } },
  },
  {
    id: 'toggle',
    group: 'actions',
    title: 'Toggle',
    description: '`toggle` flips a boolean. The layout draws a line only while it is true.',
    action: {
      id: 'toggle',
      data: { open: false },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Button', ref: 'flip', children: 'Details' },
          { if: '$.open', then: { component: 'Text', children: 'Doors open half an hour before.' } },
        ],
      },
      triggers: [{ event: 'ui:click', ref: 'flip', do: [{ toggle: 'open' }] }],
    },
    presses: [{ ref: 'flip' }],
    expected: { says: ['Details', 'Doors open half an hour before.'], data: { open: true } },
  },
  {
    id: 'list',
    group: 'actions',
    title: 'List',
    description: '`push` adds to the end of a list and `removeAt` takes out the element at a position. The loop over the list follows.',
    action: {
      id: 'list',
      data: { guests: ['Ada', 'Grace'] },
      layout: {
        component: 'Stack',
        children: [
          { for: '$.guests', as: 'guest', do: { component: 'Text', children: '$guest' } },
          { component: 'Button', ref: 'add', children: 'Add Linus' },
          { component: 'Button', ref: 'first', children: 'Remove the first' },
        ],
      },
      triggers: [
        { event: 'ui:click', ref: 'add', do: [{ push: 'guests', value: 'Linus' }] },
        { event: 'ui:click', ref: 'first', do: [{ removeAt: 'guests', index: 0 }] },
      ],
    },
    presses: [{ ref: 'add' }, { ref: 'first' }],
    expected: { says: ['Grace', 'Linus', 'Add Linus', 'Remove the first'], data: { guests: ['Grace', 'Linus'] } },
  },
  {
    id: 'input-model',
    group: 'actions',
    title: 'Input model',
    description: '`model` binds a component to a path both ways: it shows what stands there, and what is typed is written back. No trigger is needed.',
    action: {
      id: 'input-model',
      data: { name: '' },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Input', ref: 'name', model: '$.name', props: { placeholder: 'Your name' } },
          { component: 'Text', children: 'Hello, {{$.name}}.' },
        ],
      },
    },
    presses: [{ ref: 'name', type: 'ui:model', payload: 'Ada' }],
    expected: { says: ['Your name', 'Hello, Ada.'], data: { name: 'Ada' } },
  },
  {
    id: 'lifecycle',
    group: 'actions',
    title: 'Lifecycle',
    description: 'The steps under `lifecycle.mount` run once, when the action is put on a canvas, before anything is pressed.',
    action: {
      id: 'lifecycle',
      data: { status: 'waiting' },
      layout: { component: 'Text', children: 'This action is {{$.status}}.' },
      lifecycle: { mount: [{ set: 'status', value: 'on its canvas' }] },
    },
    presses: [],
    expected: { says: ['This action is on its canvas.'], data: { status: 'on its canvas' } },
  },
  {
    id: 'reset',
    group: 'actions',
    title: 'Reset',
    description: '`reset` gives a path back the value it had when the action was opened.',
    action: {
      id: 'reset',
      data: { greeting: 'Dear Ada' },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: '$.greeting' },
          { component: 'Button', ref: 'change', children: 'Say hello' },
          { component: 'Button', ref: 'back', children: 'As it was' },
        ],
      },
      triggers: [
        { event: 'ui:click', ref: 'change', do: [{ set: 'greeting', value: 'Hello, Ada' }] },
        { event: 'ui:click', ref: 'back', do: [{ reset: 'greeting' }] },
      ],
    },
    presses: [{ ref: 'change' }, { ref: 'back' }],
    expected: { says: ['Dear Ada', 'Say hello', 'As it was'], data: { greeting: 'Dear Ada' } },
  },
];
