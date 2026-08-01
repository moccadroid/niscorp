import type { LayoutNode } from '@niscorp/nova';

// The crew half of wake-up calls: the desk books the morning ring FOR a guest.
//
// There is no guest picker. This surface is stay-scoped — it arrives in a
// guest's workspace already carrying them — so a chooser would be asking the
// clerk to re-select the person they are already looking at, and at a real
// hotel it would be a grid of four hundred names. The guest is CONTEXT here,
// stated once at the top; the only decision on this card is the time.
export const setCallLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 10, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 24, color: 'accent' } },
      { component: 'Text', props: { weight: 600 }, children: 'On the sheet' },
      {
        component: 'Text',
        props: { size: 'sm', color: 'mute', align: 'center' },
        children: { if: '$.stayLabel', then: '{{$.chosen.label}} tomorrow for {{$.stayLabel}}.', else: '{{$.chosen.label}} tomorrow.' },
      },
    ],
  },
  else: {
    if: '$.stayId',
    then: {
      component: 'Stack',
      props: { gap: 12 },
      children: [
        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: { if: '$.stayLabel', then: 'The morning ring for {{$.stayLabel}}.', else: 'The morning ring for this guest.' } },
        {
          component: 'Grid',
          props: { min: 84, gap: 8 },
          children: {
            for: '$.times',
            as: 't',
            key: 'option_id',
            do: { component: 'Tile', ref: 'pick-time', props: { title: '$t.label', value: '$t', active: { $if: { $eq: ['$t.label', '$.chosen.label'] }, $then: true, $else: false } } },
          },
        },
        {
          component: 'Button',
          ref: 'set',
          props: { big: true, icon: 'moon', disabled: { $if: '$.chosen.label', $then: '$.working', $else: true } },
          children: { if: '$.chosen.label', then: 'Ring at {{$.chosen.label}} tomorrow', else: 'Pick a time' },
        },
      ],
    },
    // Opened with nobody in hand — say so rather than offering the house.
    else: { component: 'Empty', props: { icon: 'moon', title: 'No guest in hand', hint: 'Open a guest and this books their morning ring.' } },
  },
};
