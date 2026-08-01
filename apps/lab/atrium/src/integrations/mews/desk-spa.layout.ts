import type { LayoutNode } from '@niscorp/nova';

// The crew half of spa.book: the desk reserves a treatment FOR a guest —
// same catalogue rows, same live slots from the connector, same mirror row
// and folio charge the guest's own booking makes.
//
// No guest picker: the surface arrives with a stay, so the guest is context
// and the decisions are treatment and time.
export const deskSpaLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 10, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 24, color: 'accent' } },
      { component: 'Text', props: { weight: 600 }, children: 'Booked' },
      { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: '{{$.booked.treatment}} — {{$.booked.when_label}} · confirmation {{$.booked.confirmation}} · charged to the room.' },
    ],
  },
  else: {
    if: '$.stayId',
    then: {
      component: 'Stack',
      props: { gap: 12 },
      children: [
        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'A treatment for {{$.stayLabel}}, charged to the room.' },
        {
          component: 'Stack',
          props: { gap: 6 },
          children: {
            for: '$.treatments',
            as: 't',
            key: 'option_id',
            do: { component: 'Tile', ref: 'pick-treatment', props: { title: '$t.label', blurb: '$t.price_line', icon: '$t.icon', value: '$t', active: { $if: { $eq: ['$t.option_id', '$.treatment.option_id'] }, $then: true, $else: false } } },
          },
        },
        {
          if: '$.treatment.label',
          then: {
            component: 'Stack',
            props: { gap: 10 },
            children: [
              { component: 'Rule', props: { label: 'When' } },
              {
                if: '$.slotsLoading',
                then: { component: 'Skeleton', props: { h: 40, count: 2 } },
                else: {
                  if: '$.slots.length',
                  then: {
                    component: 'Grid',
                    props: { min: 104, gap: 8 },
                    children: {
                      for: '$.slots',
                      as: 'sl',
                      key: 'slot_id',
                      do: { component: 'Tile', ref: 'pick-slot', props: { title: '$sl.time', blurb: '$sl.day_label', value: '$sl', active: { $if: { $eq: ['$sl.slot_id', '$.slot.slot_id'] }, $then: true, $else: false } } },
                    },
                  },
                  else: { component: 'Empty', props: { icon: 'leaf', title: 'Fully booked', hint: 'No open slots in the next days.' } },
                },
              },
              {
                component: 'Button',
                ref: 'book',
                props: { big: true, icon: 'check', disabled: { $if: '$.slot.at', $then: '$.working', $else: true } },
                children: { if: '$.slot.at', then: 'Book {{$.slot.day_label}} {{$.slot.time}} · {{$.treatment.amount_display}}', else: 'Pick a time' },
              },
            ],
          },
          else: '',
        },
      ],
    },
    else: { component: 'Empty', props: { icon: 'leaf', title: 'No guest in hand', hint: 'Open a guest and this books them a treatment.' } },
  },
};
