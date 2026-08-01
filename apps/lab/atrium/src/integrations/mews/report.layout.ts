import type { LayoutNode } from '@niscorp/nova';

// Spa utilization for the ops manager — bookings counted by treatment and
// status, straight from the mirror rows. Numbers before adjectives.
export const reportLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 12 },
  children: [
    { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Every booking mirrored from Mews, counted by treatment and how it ended.' },
    {
      if: '$.report.length',
      then: {
        component: 'Card',
        children: {
          component: 'Stack',
          props: { gap: 6 },
          children: {
            for: '$.report',
            as: 'r',
            key: 'treatment',
            do: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Text', children: '$r.treatment' },
                {
                  component: 'Row',
                  props: { gap: 8, align: 'center' },
                  children: [
                    { component: 'Badge', props: { tone: 'neutral' }, children: '$r.status' },
                    { component: 'Text', props: { weight: 'medium' }, children: '$r.count' },
                  ],
                },
              ],
            },
          },
        },
      },
      else: { component: 'Empty', props: { icon: 'chart', title: 'No bookings yet', hint: 'Utilization appears once guests start booking.' } },
    },
  ],
};
