import type { LayoutNode } from '@niscorp/nova';

// The guest's own treatments — mirror rows, freshest first. A booked one can be
// cancelled here; everything else is history and reads that way.
export const visitsLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 12 },
  children: [
    {
      if: '$.visits.length',
      then: {
        component: 'Stack',
        props: { gap: 8 },
        children: {
          for: '$.visits',
          as: 'v',
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
                      { component: 'Text', props: { weight: 'medium' }, children: '$v.treatment' },
                      { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$v.when_display' },
                    ],
                  },
                  { component: 'Badge', props: { tone: '$v.status_tone' }, children: '$v.status' },
                ],
              },
              {
                if: { $eq: ['$v.status', 'booked'] },
                then: { component: 'Button', ref: 'cancel', props: { variant: 'quiet', value: '$v' }, children: 'Cancel this' },
                else: '',
              },
            ],
          },
        },
      },
      else: { component: 'Empty', props: { icon: 'leaf', title: 'Nothing booked', hint: 'The spa tile on your home screen has open slots.' } },
    },
  ],
};
