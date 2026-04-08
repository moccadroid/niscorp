import type { LayoutStory } from '../../story-types';

export const bindingsMissingPathsStory: LayoutStory = {
  id: 'bindings-missing-paths',
  name: 'Missing paths',
  description:
    'Demonstrates how the renderer treats nonexistent paths. `$.existing` resolves normally; `$.missing.deep.path` and `$.also.missing` resolve to empty strings inside the surrounding text instead of throwing — so the layout still renders cleanly even when data is partial.',
  kind: 'layout',
  category: 'Bindings',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 8, padding: 24 },
    children: [
      { component: 'Text', children: 'Existing: {{$.existing}}' },
      { component: 'Text', children: 'Missing template: <{{$.missing.deep.path}}>' },
      { component: 'Text', children: '$.also.missing' },
    ],
  },
  data: { existing: 'I am here' },
  expected: { textIncludes: ['I am here'] },
};
