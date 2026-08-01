import type { LayoutNode } from '@niscorp/nova';

// The call sheet — scheduled wake calls in ringing order. One button per row:
// rung. Done calls leave the sheet on the re-read, which is the whole workflow.
export const sheetLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 12 },
  children: [
    {
      if: '$.loading',
      then: { component: 'Skeleton', props: { h: 56, count: 3 } },
      else: {
        if: '$.calls.length',
        then: {
          component: 'Stack',
          props: { gap: 8 },
          children: {
            for: '$.calls',
            as: 'c',
            key: 'call_id',
            do: {
              component: 'Card',
              children: {
                component: 'Row',
                props: { justify: 'between', align: 'center' },
                children: [
                  {
                    component: 'Stack',
                    props: { gap: 2 },
                    children: [
                      { component: 'Text', props: { weight: 'medium' }, children: '{{$c.call_at}} — Room {{$c.room_number}}' },
                      { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$c.guest_name}} · {{$c.call_on}}' },
                    ],
                  },
                  { component: 'Button', ref: 'rung', props: { icon: 'check', value: '$c' }, children: 'Rung' },
                ],
              },
            },
          },
        },
        else: { component: 'Empty', props: { icon: 'moon', title: 'No calls scheduled', hint: 'Guests set these from their stay screen.' } },
      },
    },
  ],
};
