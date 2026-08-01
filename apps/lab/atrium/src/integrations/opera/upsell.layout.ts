import type { LayoutNode } from '@niscorp/nova';

// Walk a better room to the guest in hand.
//
// No guest picker: the surface arrives carrying a stay, so the only decisions
// here are which room and what to say. Offering the house to choose from was
// asking the clerk to find, in a grid, the person whose card they are already
// reading — and it only looked survivable because the demo has two guests.
export const upsellLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 10, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 24, color: 'accent' } },
      { component: 'Text', props: { weight: 600 }, children: 'Done' },
      { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: '{{$.offer.name}} posted to {{$.stayLabel}} and your note is in their messages.' },
    ],
  },
  else: {
    if: '$.stayId',
    then: {
      component: 'Stack',
      props: { gap: 12 },
      children: [
        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'What is open tonight, for {{$.stayLabel}}.' },
        {
          component: 'Stack',
          props: { gap: 6 },
          children: {
            for: '$.offers',
            as: 'o',
            key: 'code',
            do: {
              component: 'Tile',
              ref: 'pick-offer',
              props: { title: '$o.name', blurb: '$o.price_line', icon: 'sparkle', value: '$o', active: { $if: { $eq: ['$o.code', '$.offer.code'] }, $then: true, $else: false } },
            },
          },
        },
        {
          if: '$.offer.code',
          then: {
            component: 'Stack',
            props: { gap: 10 },
            children: [
              { component: 'Textarea', ref: 'note', model: '$.note', props: { placeholder: 'Your words to the guest — what they got and why you thought of them.', rows: 3 } },
              {
                component: 'Button',
                ref: 'apply',
                props: { big: true, icon: 'sparkle', disabled: { $if: '$.note', $then: '$.working', $else: true } },
                children: { if: '$.note', then: 'Move them to {{$.offer.name}} · {{$.offer.price_line}}', else: 'Write them a line first' },
              },
            ],
          },
          else: '',
        },
      ],
    },
    else: { component: 'Empty', props: { icon: 'sparkle', title: 'No guest in hand', hint: 'Open a guest and this offers them a better room.' } },
  },
};
