import type { LayoutNode } from '@niscorp/nova';

// Everybody who joined, as a ruled table — the names they chose — the
// way in beside it while people are still arriving, and the count.
export const registerLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick join', 'head join', 'table join', 'table count'], cols: [3, 1.1], rows: ['auto', 'auto', 1, 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'Joining' }] },
    { component: 'Cell', props: { area: 'head' }, children: [{ component: 'Headline', props: { level: 'title' }, children: 'Everyone who has joined' }] },
    {
      component: 'Cell',
      props: { area: 'join' },
      children: [{ component: 'Label', children: 'Scan to join' }, { component: 'Qr', props: { value: '$.address.url' } }, { component: 'Label', children: '{{$.address.host}}' }],
    },
    { component: 'Cell', props: { area: 'count', ink: 'live', align: 'end' }, children: [{ component: 'Figure', props: { label: 'Joined', value: '$.counts.joined' } }] },
    {
      component: 'Cell',
      props: { area: 'table', pad: 'none' },
      children: [
        {
          component: 'Rows',
          props: {
            rows: '$.rows',
            rowKey: 'member_id',
            empty: 'Nobody yet. Scan the code.',
            columns: [
              { label: 'Name', key: 'name', w: 1 },
            ],
          },
        },
      ],
    },
  ],
};
