import type { LayoutStory } from '../../story-types';

export const structureLayoutRefsStory: LayoutStory = {
  id: 'structure-layout-refs',
  name: 'Layout refs',
  description:
    'Demonstrates the layout store and `{ ref: "name" }` references. A reusable `user-card` layout is preloaded into the store and referenced twice from the main layout — both refs resolve to the same template, so a single source produces two identical cards bound to the surrounding data.',
  kind: 'layout',
  category: 'Structure',
  preloadLayouts: {
    'user-card': {
      component: 'Box',
      props: { padding: 16, background: '#eef2ff', radius: 8 },
      children: {
        component: 'Stack',
        props: { direction: 'column', gap: 4 },
        children: [
          {
            component: 'Text',
            props: { weight: 'bold', size: 'lg' },
            children: '{{$.name}}',
          },
          {
            component: 'Text',
            props: { size: 'sm', color: '#6b7280' },
            children: '{{$.email}}',
          },
        ],
      },
    },
  },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { ref: 'user-card' },
      { ref: 'user-card' },
    ],
  },
  data: { name: 'Ada', email: 'ada@example.com' },
  expected: { textIncludes: ['Ada', 'ada@example.com'] },
};
