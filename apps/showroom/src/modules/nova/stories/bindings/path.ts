import type { LayoutStory } from '../../story-types';

export const bindingsPathStory: LayoutStory = {
  id: 'bindings-path',
  name: 'Path bindings',
  description:
    'Demonstrates raw `$.foo.bar` path bindings as Text children. Three Text components reference `$.user.name`, `$.user.title`, and `$.user.email` — at render time the renderer resolves each path against the data tree and substitutes the value, so you see "Ada Lovelace", "Mathematician", and "ada@example.com".',
  kind: 'layout',
  category: 'Bindings',
  layout: {
    component: 'Box',
    props: { padding: 24, background: '#eef2ff', radius: 8 },
    children: {
      component: 'Stack',
      props: { direction: 'column', gap: 8 },
      children: [
        { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: '$.user.name' },
        { component: 'Text', props: { size: 'sm', color: '#475569' }, children: '$.user.title' },
        { component: 'Text', props: { size: 'sm', color: '#64748b' }, children: '$.user.email' },
      ],
    },
  },
  data: {
    user: {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      title: 'Mathematician',
    },
  },
  expected: {
    textIncludes: ['Ada Lovelace', 'ada@example.com', 'Mathematician'],
  },
};
