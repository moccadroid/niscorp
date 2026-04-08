import type { LayoutStory } from '../../story-types';

export const inputDisplayStory: LayoutStory = {
  id: 'input-display',
  name: 'Input (display)',
  description:
    'Demonstrates one-way `value` binding on Input via `{{...}}` templates (no `model`, so typing does not write back). Three inputs display data fields, plus a disabled input with a static value to show the read-only style.',
  kind: 'layout',
  category: 'Components',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      {
        component: 'Input',
        props: { value: '{{$.firstName}}', placeholder: 'First name' },
      },
      {
        component: 'Input',
        props: { value: '{{$.lastName}}', placeholder: 'Last name' },
      },
      {
        component: 'Input',
        props: { value: '{{$.email}}', placeholder: 'Email' },
      },
      {
        component: 'Input',
        props: { value: 'Read only', disabled: true },
      },
    ],
  },
  data: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
  },
  expected: {
    componentCount: 5,
    textNodeCount: 0,
  },
};
