import type { LayoutNode } from '@niscorp/nova';

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
    else: { component: 'Empty', props: { icon: 'moon', title: 'No guest in hand', hint: 'Open a guest and this books their morning ring.' } },
  },
};
