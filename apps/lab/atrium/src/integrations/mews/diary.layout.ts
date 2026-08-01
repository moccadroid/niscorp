import type { LayoutNode } from '@niscorp/nova';

// The desk's spa diary — who is on the table, when, and the three ways a
// booking ends. Buttons only exist while a booking is still 'booked'; history
// keeps its badge and nothing else.
export const diaryLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 12 },
  children: [
    {
      if: '$.loading',
      then: { component: 'Skeleton', props: { h: 70, count: 3 } },
      else: {
        if: '$.diary.length',
        then: {
          component: 'Stack',
          props: { gap: 8 },
          children: {
            for: '$.diary',
            as: 'd',
            key: 'booking_id',
            do: {
              component: 'Card',
              children: [
                {
                  component: 'Row',
                  props: { justify: 'between', align: 'center' },
                  children: [
                    {
                      component: 'Stack',
                      props: { gap: 2 },
                      children: [
                        { component: 'Text', props: { weight: 'medium' }, children: '{{$d.guest_name}} · Room {{$d.room_number}}' },
                        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$d.treatment}} — {{$d.when_display}}' },
                      ],
                    },
                    { component: 'Badge', props: { tone: '$d.status_tone' }, children: '$d.status' },
                  ],
                },
                {
                  if: { $eq: ['$d.status', 'booked'] },
                  then: {
                    component: 'Row',
                    props: { gap: 8 },
                    children: [
                      { component: 'Button', ref: 'mark-done', props: { icon: 'check', value: '$d' }, children: 'Done' },
                      { component: 'Button', ref: 'mark-noshow', props: { variant: 'quiet', value: '$d' }, children: 'No-show' },
                      { component: 'Button', ref: 'mark-cancel', props: { variant: 'quiet', value: '$d' }, children: 'Cancel' },
                    ],
                  },
                  else: '',
                },
              ],
            },
          },
        },
        else: { component: 'Empty', props: { icon: 'leaf', title: 'Nothing in the diary', hint: 'Bookings land here the moment a guest confirms one.' } },
      },
    },
  ],
};
