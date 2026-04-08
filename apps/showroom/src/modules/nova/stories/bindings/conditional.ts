import type { LayoutStory } from '../../story-types';

export const bindingsConditionalStory: LayoutStory = {
  id: 'bindings-conditional',
  name: 'Conditional directive',
  description:
    'Demonstrates `if/then/else` layout nodes branching on `$.isLoggedIn`. With the flag true the view renders a "Welcome back" greeting and a logout hint; flip the data to false (via the inspector) and both Texts swap to their else branches — same layout shape, different children.',
  kind: 'layout',
  category: 'Bindings',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 8, padding: 24 },
    children: [
      {
        if: '$.isLoggedIn',
        then: {
          component: 'Text',
          props: { size: 'lg', weight: 'bold' },
          children: 'Welcome back, {{$.name}}!',
        },
        else: {
          component: 'Text',
          props: { size: 'lg', weight: 'bold' },
          children: 'Please log in.',
        },
      },
      {
        if: '$.isLoggedIn',
        then: {
          component: 'Text',
          props: { size: 'sm', color: '#6b7280' },
          children: '(Click avatar to log out)',
        },
        else: {
          component: 'Text',
          props: { size: 'sm', color: '#6b7280' },
          children: '(No session)',
        },
      },
    ],
  },
  data: { isLoggedIn: true, name: 'Linus' },
  expected: {
    textIncludes: ['Welcome back, Linus!', '(Click avatar to log out)'],
  },
};
