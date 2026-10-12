import type { LayoutNode } from '@niscorp/nova';

export const minibarLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    {
      if: '$.posted',
      then: { component: 'Notice', props: { tone: 'good', icon: 'check' }, children: 'Added {{$.lastItem.label}} — {{$.lastItem.amount_display}} on your bill.' },
      else: '',
    },
    {
      if: '$.loading',
      then: { component: 'Skeleton', props: { h: 60, count: 3 } },
      else: {
        if: '$.items.length',
        then: {
          component: 'Grid',
          props: { min: 140, gap: 8 },
          children: {
            for: '$.items',
            as: 'i',
            key: 'option_id',
            do: {
              component: 'Tile',
              ref: 'take',
              props: {
                title: '$i.label',
                blurb: '$i.amount_display',
                icon: '$i.icon',
                value: '$i',
                active: { $if: { $eq: ['$i.option_id', '$.chosen.option_id'] }, $then: true, $else: false },
              },
            },
          },
        },
        else: { component: 'Empty', props: { icon: 'receipt', title: 'No minibar here', hint: 'This room is not stocked.' } },
      },
    },
    {
      if: '$.chosen.option_id',
      then: {
        component: 'Stack',
        props: { gap: 8 },
        children: [
          {
            component: 'Button',
            ref: 'add',
            props: { big: true, icon: 'receipt', disabled: '$.working' },
            children: { if: '$.working', then: 'Adding…', else: 'Add {{$.chosen.label}} · {{$.chosen.amount_display}} to my bill' },
          },
          { component: 'Text', props: { size: 'xs', color: 'faint', align: 'center' }, children: 'Tap it again to change your mind — nothing is charged until you press this.' },
        ],
      },
      else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Tap what you took. Nothing goes on your bill until you confirm it.' },
    },
  ],
};
