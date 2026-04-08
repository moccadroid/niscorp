import type { LayoutStory } from '../../story-types';

export const nestedConditionalsStory: LayoutStory = {
  id: 'bindings-nested-conditionals',
  name: 'Nested conditionals',
  description:
    'Two layers of ConditionalNode: if `$.user`, then branch on `$.user.isAdmin` to render '
    + 'either the admin panel or the user dashboard; else render the login form.',
  kind: 'layout',
  category: 'Bindings',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      {
        if: '$.user',
        then: {
          if: '$.user.isAdmin',
          then: {
            component: 'Box',
            props: { padding: 16, background: '#fef3c7', radius: 6 },
            children: [
              {
                component: 'Text',
                props: { weight: 'bold', size: 'lg' },
                children: 'Admin panel',
              },
              {
                component: 'Text',
                children: 'Welcome, {{$.user.name}} (admin)',
              },
            ],
          },
          else: {
            component: 'Box',
            props: { padding: 16, background: '#dbeafe', radius: 6 },
            children: [
              {
                component: 'Text',
                props: { weight: 'bold', size: 'lg' },
                children: 'User dashboard',
              },
              {
                component: 'Text',
                children: 'Welcome, {{$.user.name}}',
              },
            ],
          },
        },
        else: {
          component: 'Box',
          props: { padding: 16, background: '#f3f4f6', radius: 6 },
          children: { component: 'Text', children: 'Please log in.' },
        },
      },
    ],
  },
  data: { user: { name: 'Ada Lovelace', isAdmin: true } },
  expected: {
    textIncludes: ['Admin panel', 'Welcome, Ada Lovelace (admin)'],
  },
};
