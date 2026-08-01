import type { LayoutNode } from '@niscorp/nova';

// Phone-shaped: a narrow column, generous targets, no table. The same `Rows`
// primitive would work and would be wrong — this is a list of jobs, read at
// arm's length.
export const serviceTasksLayout: LayoutNode = {
  component: 'Box',
  props: {},
  children: {
    component: 'Stack',
    props: { gap: 18, maxWidth: 520 },
    children: [
      {
        component: 'Tabs',
        ref: 'tab',
        props: {
          value: '$.scope',
          options: [
            { value: 'open', label: 'To do' },
            { value: 'done', label: 'Done' },
            { value: 'all', label: 'All' },
          ],
        },
      },
      {
        if: '$.loading',
        then: { component: 'Skeleton', props: { h: 86, count: 3 } },
        else: {
          if: '$.rows.length',
          then: {
            component: 'Stack',
            props: { gap: 10 },
            children: {
              for: '$.rows',
              as: 't',
              key: 'task_id',
              do: {
                component: 'Card',
                props: {},
                children: {
                  component: 'Stack',
                  props: { gap: 12 },
                  children: [
                    {
                      component: 'Row',
                      props: { justify: 'between', align: 'start', gap: 10 },
                      children: [
                        {
                          component: 'Stack',
                          props: { gap: 3 },
                          children: [
                            { component: 'Text', props: { weight: 600, size: 'lg' }, children: '$t.title' },
                            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Room {{$t.room_number}} · {{$t.created_display}}' },
                          ],
                        },
                        { component: 'Badge', props: { tone: 'neutral' }, children: '$t.kind' },
                      ],
                    },
                    {
                      if: { $eq: ['$t.status', 'done'] },
                      then: { component: 'Button', ref: 'reopen', props: { variant: 'quiet', big: true, value: '$t' }, children: 'Reopen' },
                      else: { component: 'Button', ref: 'done', props: { big: true, icon: 'check', value: '$t' }, children: 'Done' },
                    },
                  ],
                },
              },
            },
          },
          else: { component: 'Empty', props: { icon: 'check', title: 'Nothing waiting', hint: 'The floor is clear.' } },
        },
      },
    ],
  },
};
