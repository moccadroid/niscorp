import type { LayoutStory } from '../../story-types';

export const bindingsTemplatesStory: LayoutStory = {
  id: 'bindings-templates',
  name: 'Template interpolation',
  description:
    'Demonstrates `{{...}}` template interpolation inside Text children. Two Texts mix literal copy with `{{$.name}}`, `{{$.unread}}`, and `{{$.accountId}}` placeholders — the renderer expands them inline so you read a single fluent sentence with the data values spliced in.',
  kind: 'layout',
  category: 'Bindings',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      {
        component: 'Text',
        props: { size: 'lg', weight: 'bold' },
        children: 'Welcome, {{$.name}}! You have {{$.unread}} unread messages.',
      },
      {
        component: 'Text',
        props: { size: 'sm', color: '#6b7280' },
        children: 'Your account ID is #{{$.accountId}}.',
      },
    ],
  },
  data: { name: 'Grace', unread: 7, accountId: 'A-9842' },
  expected: {
    textIncludes: ['Welcome, Grace!', '7 unread messages', 'A-9842'],
  },
};
