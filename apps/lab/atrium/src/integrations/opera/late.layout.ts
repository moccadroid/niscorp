import type { LayoutNode } from '@niscorp/nova';

// Late checkout — the times and prices are Opera's catalogue rows; asking
// raises a request the DESK answers. Nothing is promised here, and the status
// list below says exactly where each ask stands.
export const lateLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    {
      if: '$.done',
      then: { component: 'Notice', props: { tone: 'good', icon: 'check' }, children: 'Asked for {{$.chosen.label}} — the desk will confirm shortly.' },
      else: {
        component: 'Stack',
        props: { gap: 12 },
        children: [
          {
            if: '$.loading',
            then: { component: 'Skeleton', props: { h: 60, count: 2 } },
            else: {
              component: 'Grid',
              props: { min: 140, gap: 8 },
              children: {
                for: '$.options',
                as: 'o',
                key: 'option_id',
                do: { component: 'Tile', ref: 'pick', props: { title: '$o.label', blurb: '$o.amount_display', icon: '$o.icon', value: '$o', active: { $if: { $eq: ['$o.option_id', '$.chosen.option_id'] }, $then: true, $else: false } } },
              },
            },
          },
          {
            component: 'Button',
            ref: 'ask',
            props: { big: true, icon: 'door', disabled: { $if: '$.chosen.label', $then: '$.working', $else: true } },
            children: { if: '$.chosen.label', then: 'Ask the desk', else: 'Pick a time' },
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
                {
                  component: 'Stack',
                  props: { gap: 2 },
                  children: [
                    { component: 'Text', children: '$r.label' },
                    { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$r.asked_display' },
                  ],
                },
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
