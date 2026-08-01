import type { LayoutNode } from '@niscorp/nova';

// The RESERVATION, and the two controls that move it. State controls are
// EXISTENCE, not disablement: a stay that is in house offers check-out, an
// arriving one offers check-in, a departed one offers neither — the layout
// branches on the stay's own data, never on a role or capability.
//
// It used to carry the guest's open requests as well, and it no longer does.
// `desk.brief` arrives in the same workspace and answers "who is this" properly
// — history, spend, notes, language, everything open — so a second card
// half-answering it was two live surfaces for one record, which is the same bug
// as two figures for one number. This one is the booking; that one is the
// person.
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

            // The state controls — existence per the stay's own state.
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
