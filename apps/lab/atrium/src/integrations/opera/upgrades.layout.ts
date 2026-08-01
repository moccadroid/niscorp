import type { LayoutNode } from '@niscorp/nova';

// Paid upgrades — offers come LIVE from the Opera connector (it knows what is
// open tonight), asking raises a request the desk answers. Prices arrive
// formatted from the connector; nothing here does arithmetic.
export const upgradesLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    {
      if: '$.done',
      then: { component: 'Notice', props: { tone: 'good', icon: 'check' }, children: 'Asked about {{$.chosen.name}} — the desk will come back to you.' },
      else: {
        component: 'Stack',
        props: { gap: 12 },
        children: [
          {
            if: '$.loading',
            then: { component: 'Skeleton', props: { h: 70, count: 2 } },
            else: {
              if: '$.offers.length',
              then: {
                component: 'Stack',
                props: { gap: 8 },
                children: {
                  for: '$.offers',
                  as: 'o',
                  key: 'code',
                  do: { component: 'Tile', ref: 'pick', props: { title: '$o.name', blurb: '$o.price_line', icon: 'sparkle', value: '$o', active: { $if: { $eq: ['$o.code', '$.chosen.code'] }, $then: true, $else: false } } },
                },
              },
              else: { component: 'Empty', props: { icon: 'sparkle', title: 'Nothing open tonight', hint: 'Upgrades show here when a better room is free.' } },
            },
          },
          {
            component: 'Button',
            ref: 'ask',
            props: { big: true, icon: 'sparkle', disabled: { $if: '$.chosen.name', $then: '$.working', $else: true } },
            children: { if: '$.chosen.name', then: 'Ask the desk', else: 'Pick a room' },
          },
        ],
      },
    },
    {
      if: '$.requests.length',
      then: {
        component: 'Stack',
        props: { gap: 8 },
        children: [
          { component: 'Rule', props: { label: 'Your requests' } },
          {
            for: '$.requests',
            as: 'r',
            key: 'request_id',
            do: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Text', children: '$r.label' },
                { component: 'Badge', props: { tone: '$r.status_tone' }, children: '$r.status' },
              ],
            },
          },
        ],
      },
      else: '',
    },
  ],
};
