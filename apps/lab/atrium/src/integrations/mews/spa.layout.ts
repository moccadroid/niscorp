import type { LayoutNode } from '@niscorp/nova';

// Book the spa — the whole loop on one sheet. Treatments come from the Mews
// catalogue rows, the SLOTS come live from the connector (it owns availability),
// booking goes through the connector and only then lands as our mirror row plus
// a folio line. Nothing here knows a price or a time; every figure arrived from
// the integration.
export const spaLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 12, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 28, color: 'accent' } },
      { component: 'Text', props: { serif: true, size: 'xl', align: 'center' }, children: 'Booked' },
      { component: 'Text', props: { align: 'center' }, children: '{{$.booked.treatment}} — {{$.booked.when_label}}' },
      { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: 'Confirmation {{$.booked.confirmation}} · charged to your room.' },
    ],
  },
  else: {
    component: 'Stack',
    props: { gap: 16 },
    children: [
      {
        if: '$.loading',
        then: { component: 'Skeleton', props: { h: 60, count: 3 } },
        else: {
          component: 'Grid',
          props: { min: 150, gap: 8 },
          children: {
            for: '$.treatments',
            as: 't',
            key: 'option_id',
            do: { component: 'Tile', ref: 'pick-treatment', props: { title: '$t.label', blurb: '$t.price_line', icon: '$t.icon', value: '$t', active: { $if: { $eq: ['$t.option_id', '$.treatment.option_id'] }, $then: true, $else: false } } },
          },
        },
      },
      {
        if: '$.treatment.label',
        then: {
          component: 'Stack',
          props: { gap: 12 },
          children: [
            { component: 'Rule', props: { label: 'Times for {{$.treatment.label}}' } },
            {
              if: '$.slotsLoading',
              then: { component: 'Skeleton', props: { h: 44, count: 2 } },
              else: {
                if: '$.slots.length',
                then: {
                  component: 'Grid',
                  props: { min: 110, gap: 8 },
                  children: {
                    for: '$.slots',
                    as: 's',
                    key: 'slot_id',
                    do: { component: 'Tile', ref: 'pick-slot', props: { title: '$s.time', blurb: '$s.day_label', value: '$s', active: { $if: { $eq: ['$s.slot_id', '$.slot.slot_id'] }, $then: true, $else: false } } },
                  },
                },
                else: { component: 'Empty', props: { icon: 'leaf', title: 'Fully booked', hint: 'No open slots in the next days — the desk can waitlist you.' } },
              },
            },
            { if: '$.slot.at', then: { component: 'Notice', props: { tone: 'accent', icon: 'leaf' }, children: '{{$.treatment.label}} · {{$.slot.day_label}} {{$.slot.time}} · {{$.treatment.amount_display}}' }, else: '' },
            {
              component: 'Button',
              ref: 'book',
              props: { big: true, icon: 'check', disabled: { $if: '$.slot.at', $then: '$.working', $else: true } },
              children: { if: '$.slot.at', then: 'Book — charge my room', else: 'Pick a time' },
            },
          ],
        },
        else: '',
      },
    ],
  },
};
