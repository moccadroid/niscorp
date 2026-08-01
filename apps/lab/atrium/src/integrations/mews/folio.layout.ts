import type { LayoutNode } from '@niscorp/nova';

// Mews' bill-item void, as a surface. The same two steps as Opera's — pick
// the line, say why — because the CAPABILITY is the same and the guest-facing
// job is the same. What differs is the call underneath, which is the whole
// reason each vendor ships its own surface rather than the app writing one.
export const folioLayout: LayoutNode = {
  component: 'Box',
  props: { py: 18, px: 18 },
  children: {
    component: 'Stack',
    props: { gap: 14 },
    children: [
      {
        component: 'Row',
        props: { justify: 'between', align: 'baseline' },
        children: [
          { component: 'Text', props: { serif: true, size: 'lg' }, children: 'The bill' },
          { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.total.total_display}}' },
        ],
      },

      {
        if: '$.done',
        then: {
          component: 'Notice',
          props: { tone: 'good', icon: 'check', title: 'Voided' },
          children: '{{$.line.description}} taken off — Mews reference {{$.reversal.reversal}}. The guest sees the new total on their next look.',
        },
        else: '',
      },

      {
        if: '$.lines.length',
        then: {
          component: 'Stack',
          props: { gap: 4 },
          children: {
            for: '$.lines',
            as: 'l',
            key: 'line_id',
            do: {
              component: 'Tile',
              ref: 'pick-line',
              props: {
                title: '$l.description',
                blurb: '{{$l.amount_display}} · {{$l.posted_display}}',
                icon: 'receipt',
                value: '$l',
                active: { $if: { $eq: ['$l.line_id', '$.line.line_id'] }, $then: true, $else: false },
              },
            },
          },
        },
        else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Nothing posted to this stay.' },
      },

      {
        if: '$.line.line_id',
        then: {
          component: 'Stack',
          props: { gap: 10 },
          children: [
            { component: 'Rule', props: { label: 'Why' } },
            {
              component: 'Textarea',
              ref: 'reason',
              model: '$.reason',
              props: { placeholder: 'Posted in error, guest disputes it, comped — in your words.', rows: 2 },
            },
            {
              component: 'Button',
              ref: 'void',
              props: { big: true, icon: 'close', disabled: { $if: '$.reason', $then: '$.working', $else: true } },
              children: { if: '$.working', then: 'Voiding…', else: 'Take {{$.line.amount_display}} off the bill' },
            },
            { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', icon: 'alert' }, children: '$.error.message' }, else: '' },
          ],
        },
        else: '',
      },
    ],
  },
};
