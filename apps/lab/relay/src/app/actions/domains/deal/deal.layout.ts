import type { LayoutNode } from '@niscorp/nova';

const label = (text: string): LayoutNode => ({
  component: 'Text',
  props: { size: 'xs', weight: 600, color: 'mute', upper: true },
  children: text,
});

export const dealLayout: LayoutNode = {
  component: 'Box',
  children: [
      {
        component: 'Box',
        props: { border: 'bottom', py: 14 },
        children: {
          component: 'Stack',
          props: { gap: 2 },
          children: [
            { component: 'DialogTitle', children: '{{$.record.title}}' },
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.record.company}}' },
          ],
        },
      },
      {
        component: 'Box',
        props: { py: 18 },
        children: {
          if: '$.loading',
          then: { component: 'Stack', props: { gap: 14 }, children: [{ component: 'Skeleton', props: { width: '40%', height: 30 } }, { component: 'Skeleton', props: { width: '100%', height: 8 } }, { component: 'Skeleton', props: { width: '60%' } }, { component: 'Skeleton', props: { width: '80%' } }] },
          else: {
            component: 'Stack',
            props: { gap: 18 },
            children: [
              {
                component: 'Row',
                props: { justify: 'between', align: 'center', gap: 12, wrap: true },
                children: [
                  {
                    component: 'Row',
                    props: { gap: 12, align: 'center' },
                    children: [
                      { component: 'Text', props: { size: '2xl', weight: 680 }, children: '{{$.record.value_display}}' },
                      { component: 'Badge', props: { tone: 'blue', dot: true }, children: '{{$.record.status}}' },
                      { component: 'Badge', props: { tone: 'slate' }, children: '{{$.record.stage}}' },
                    ],
                  },
                  { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Closes {{$.record.close_date_display}}' },
                ],
              },
              {
                component: 'Stack',
                props: { gap: 6 },
                children: [
                  {
                    component: 'Row',
                    props: { justify: 'between', align: 'center' },
                    children: [label('Win probability'), { component: 'Text', props: { size: 'xs', weight: 560 }, children: '{{$.record.prob}}%' }],
                  },
                  { component: 'Progress', props: { value: '{{$.record.prob}}%' } },
                ],
              },
              {
                component: 'Row',
                props: { gap: 8, wrap: true },
                children: [
                  { component: 'Button', ref: 'edit', props: { variant: 'primary', size: 'sm', icon: 'edit' }, children: 'Edit' },
                  { component: 'Button', ref: 'add-task', props: { variant: 'default', size: 'sm', icon: 'check-square' }, children: 'Add task' },
                  { component: 'Button', ref: 'won', props: { variant: 'ghost', size: 'sm' }, children: 'Mark won' },
                  { component: 'Button', ref: 'lost', props: { variant: 'danger', size: 'sm' }, children: 'Mark lost' },
                ],
              },
              {
                component: 'Row',
                props: { gap: 24, align: 'start', wrap: true },
                children: [
                  {
                    component: 'Stack',
                    props: { grow: true, gap: 20 },
                    children: [
                      {
                        component: 'Stack',
                        props: { gap: 8 },
                        children: [
                          label('Line items'),
                          {
                            if: '$.lineItems.length',
                            then: {
                              component: 'Stack',
                              props: { gap: 0 },
                              children: {
                                for: '$.lineItems',
                                as: 'li',
                                key: 'line_item_id',
                                do: {
                                  component: 'Box',
                                  props: { py: 9, border: 'bottom' },
                                  children: {
                                    component: 'Row',
                                    props: { justify: 'between', align: 'center', gap: 10 },
                                    children: [
                                      {
                                        component: 'Stack',
                                        props: { gap: 1 },
                                        children: [
                                          { component: 'Text', props: { size: 'sm', weight: 540 }, children: '{{$.li.product}}' },
                                          { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '{{$.li.quantity}} × {{$.li.unit_price}}' },
                                        ],
                                      },
                                      { component: 'Text', props: { size: 'sm', weight: 600, mono: true }, children: '{{$.li.line_total}}' },
                                    ],
                                  },
                                },
                              },
                            },
                            else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'No line items on this deal.' },
                          },
                        ],
                      },
                      {
                        component: 'Stack',
                        props: { gap: 8 },
                        children: [
                          label('Tasks'),
                          {
                            if: '$.tasks.length',
                            then: {
                              component: 'Stack',
                              props: { gap: 0 },
                              children: {
                                for: '$.tasks',
                                as: 't',
                                key: 'task_id',
                                do: {
                                  component: 'Box',
                                  props: { py: 9, border: 'bottom' },
                                  children: {
                                    component: 'Row',
                                    props: { justify: 'between', align: 'center', gap: 10 },
                                    children: [
                                      {
                                        component: 'Row',
                                        props: { gap: 9, align: 'center' },
                                        children: [
                                          {
                                            if: '$.t.done',
                                            then: { component: 'Icon', props: { name: 'check-square', size: 15 } },
                                            else: { component: 'Button', ref: 'complete-task', props: { variant: 'ghost', size: 'sm', icon: 'circle-dot', value: '$.t.task_id' } },
                                          },
                                          { component: 'Text', props: { size: 'sm' }, children: '{{$.t.title}}' },
                                        ],
                                      },
                                      { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '{{$.t.due_date}}' },
                                    ],
                                  },
                                },
                              },
                            },
                            else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'No tasks yet.' },
                          },
                        ],
                      },
                    ],
                  },
                  {
                    component: 'Box',
                    props: { width: 'min(340px, 100%)' },
                    children: {
                      component: 'Stack',
                      props: { gap: 20 },
                      children: [
                        {
                          component: 'Stack',
                          props: { gap: 8 },
                          children: [
                            label('Primary contact'),
                            {
                              if: '$.contact.name',
                              then: {
                                component: 'Stack',
                                props: { gap: 8 },
                                children: [
                                  {
                                    component: 'Row',
                                    props: { gap: 10, align: 'center' },
                                    children: [
                                      { component: 'Avatar', props: { name: '$.contact.name' } },
                                      {
                                        component: 'Stack',
                                        props: { gap: 1 },
                                        children: [
                                          { component: 'Text', props: { size: 'sm', weight: 560 }, children: '{{$.contact.name}}' },
                                          { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '{{$.contact.title}}' },
                                        ],
                                      },
                                    ],
                                  },
                                  { component: 'Row', props: { gap: 7, align: 'center' }, children: [{ component: 'Icon', props: { name: 'mail', size: 14 } }, { component: 'Text', props: { size: 'sm', mono: true, color: 'dim' }, children: '{{$.contact.email}}' }] },
                                  { component: 'Row', props: { gap: 7, align: 'center' }, children: [{ component: 'Icon', props: { name: 'phone', size: 14 } }, { component: 'Text', props: { size: 'sm', color: 'dim' }, children: '{{$.contact.phone}}' }] },
                                ],
                              },
                              else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'No primary contact.' },
                            },
                          ],
                        },
                        {
                          component: 'Stack',
                          props: { gap: 8 },
                          children: [
                            label('Activity'),
                            {
                              if: '$.activities.length',
                              then: {
                                component: 'Stack',
                                props: { gap: 13 },
                                children: {
                                  for: '$.activities',
                                  as: 'a',
                                  key: 'activity_id',
                                  do: {
                                    component: 'Row',
                                    props: { gap: 10, align: 'center' },
                                    children: [
                                      {
                                        component: 'ActivityDot',
                                        props: { tone: '$.a.tone' },
                                        children: {
                                          if: { $eq: ['$.a.type', 'call'] },
                                          then: { component: 'Icon', props: { name: 'phone', size: 14 } },
                                          else: {
                                            if: { $eq: ['$.a.type', 'email'] },
                                            then: { component: 'Icon', props: { name: 'mail', size: 14 } },
                                            else: {
                                              if: { $eq: ['$.a.type', 'meeting'] },
                                              then: { component: 'Icon', props: { name: 'calendar', size: 14 } },
                                              else: { component: 'Icon', props: { name: 'edit', size: 14 } },
                                            },
                                          },
                                        },
                                      },
                                      {
                                        component: 'Stack',
                                        props: { gap: 1 },
                                        children: [
                                          { component: 'Text', props: { size: 'sm' }, children: '{{$.a.subject}}' },
                                          { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '{{$.a.owner}} · {{$.a.when}}' },
                                        ],
                                      },
                                    ],
                                  },
                                },
                              },
                              else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'No activity logged.' },
                            },
                          ],
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    ],
};
