import type { LayoutNode } from '@niscorp/nova';

export const guestLayout: LayoutNode = {
  component: 'Box',
  props: {},
  children: {
    component: 'Stack',
    props: { gap: 20, maxWidth: 720 },
    children: [
      {
        if: '$.loading',
        then: { component: 'Skeleton', props: { h: 40, count: 3 } },
        else: {
          component: 'Stack',
          props: { gap: 20 },
          children: [
            {
              component: 'Row',
              props: { justify: 'between', align: 'center', gap: 14, wrap: true },
              children: [
                {
                  component: 'Row',
                  props: { gap: 14, align: 'center' },
                  children: [
                    { component: 'Avatar', props: { name: '$.stay.guest_name', size: 44 } },
                    {
                      component: 'Stack',
                      props: { gap: 2 },
                      children: [
                        { component: 'Text', props: { serif: true, size: 'xl' }, children: '$.stay.guest_name' },
                        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.stay.room_kind}} {{$.stay.room_number}} · {{$.stay.arrival_display}} to {{$.stay.departure_display}}' },
                      ],
                    },
                  ],
                },
                { component: 'Badge', props: { tone: 'accent', dot: true }, children: '$.stay.state_text' },
              ],
            },

            {
              component: 'Card',
              props: {},
              children: {
                component: 'Grid',
                props: { min: 150, gap: 18 },
                children: [
                  { component: 'Stat', props: { label: 'Rate', value: '$.stay.rate_display', hint: 'per night' } },
                  { component: 'Stat', props: { label: 'Tier', value: '$.stay.tier' } },
                  { component: 'Stat', props: { label: 'Key', value: { $if: '$.stay.key_issued', $then: 'Issued', $else: '—' } } },
                ],
              },
            },

            {
              component: 'Row',
              props: { gap: 10, wrap: true },
              children: [
                {
                  if: '$.stay.checked_in',
                  then: { component: 'Button', ref: 'checkout', props: { variant: 'quiet', icon: 'door', disabled: '$.working' }, children: 'Check out' },
                  else: { component: 'Button', ref: 'checkin', props: { icon: 'check', disabled: '$.working' }, children: 'Check in now' },
                },
              ],
            },

          ],
        },
      },
    ],
  },
};
