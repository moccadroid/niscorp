import type { LayoutNode } from '@niscorp/nova';

export const folioLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 18 },
  children: [
    {
      if: '$.loading',
      then: { component: 'Skeleton', props: { h: 24, count: 4 } },
      else: {
        component: 'Rows',
        props: {
          rows: '$.lines',
          rowKey: 'line_id',
          empty: 'Nothing posted yet.',
          columns: [
            { w: 3, cell: { kind: 'primary', key: 'description', subKey: 'posted_display' } },
            { w: 'auto', cell: { kind: 'text', key: 'amount_display' } },
          ],
        },
      },
    },
    {
      component: 'Row',
      props: { justify: 'between', align: 'baseline' },
      children: [
        { component: 'Text', props: { size: 'xs', caps: true, color: 'faint', weight: 650 }, children: 'Total' },
        { component: 'Text', props: { serif: true, size: 'xl' }, children: '$.total.total_display' },
      ],
    },
  ],
};
