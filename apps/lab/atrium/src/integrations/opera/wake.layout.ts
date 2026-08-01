import type { LayoutNode } from '@niscorp/nova';

// A wake-up call, set from the switchboard's own times. The list of times is
// Opera's catalogue rows; "tomorrow" is the table's default — neither is
// decided here.
export const wakeLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    {
      if: '$.calls.length',
      then: {
        component: 'Stack',
        props: { gap: 8 },
        children: {
          for: '$.calls',
          as: 'c',
          key: 'call_id',
          do: {
            component: 'Card',
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                {
                  component: 'Stack',
                  props: { gap: 2 },
                  children: [
                    { component: 'Text', props: { weight: 'medium' }, children: '{{$c.call_at}} · {{$c.call_on}}' },
                    { component: 'Badge', props: { tone: '$c.status_tone' }, children: '$c.status' },
                  ],
                },
                {
                  if: { $eq: ['$c.status', 'scheduled'] },
                  then: { component: 'Button', ref: 'cancel', props: { variant: 'quiet', value: '$c' }, children: 'Cancel' },
                  else: '',
                },
              ],
            },
          },
        },
      },
      else: '',
    },
    { component: 'Rule', props: { label: 'Set one for tomorrow' } },
    {
      if: '$.loading',
      then: { component: 'Skeleton', props: { h: 44, count: 2 } },
      else: {
        component: 'Grid',
        props: { min: 90, gap: 8 },
        children: {
          for: '$.times',
          as: 't',
          key: 'option_id',
          do: { component: 'Tile', ref: 'pick-time', props: { title: '$t.label', value: '$t', active: { $if: { $eq: ['$t.label', '$.chosen.label'] }, $then: true, $else: false } } },
        },
      },
    },
    { if: '$.chosen.label', then: { component: 'Notice', props: { tone: 'accent', icon: 'moon' }, children: 'The desk will ring your room at {{$.chosen.label}} tomorrow.' }, else: '' },
    {
      component: 'Button',
      ref: 'set',
      props: { big: true, icon: 'moon', disabled: { $if: '$.chosen.label', $then: '$.working', $else: true } },
      children: { if: '$.chosen.label', then: 'Set the call', else: 'Pick a time' },
    },
  ],
};
