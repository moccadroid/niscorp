import type { LayoutNode } from '@niscorp/nova';

export const opsIssuesLayout: LayoutNode = {
  component: 'Box',
  props: {},
  children: {
    component: 'Stack',
    props: { gap: 22, maxWidth: 1000 },
    children: [
      {
        component: 'Grid',
        props: { min: 320, gap: 16, align: 'start' },
        children: [
          {
            component: 'Section',
            props: { title: 'By type' },
            children: {
              component: 'Rows',
              props: {
                rows: '$.byKind',
                loading: '$.loading',
                rowKey: 'kind',
                empty: 'Nothing reported.',
                columns: [
                  { w: 3, cell: { kind: 'primary', key: 'kind' } },
                  { w: 'auto', cell: { kind: 'text', key: 'count' } },
                ],
              },
            },
          },
          {
            component: 'Section',
            props: { title: 'By room', hint: 'Worst first' },
            children: {
              component: 'Rows',
              props: {
                rows: '$.byRoom',
                loading: '$.loading',
                rowKey: 'room_number',
                empty: 'Nothing reported.',
                columns: [
                  { w: 3, cell: { kind: 'primary', key: 'room_number' } },
                  { w: 'auto', cell: { kind: 'text', key: 'count' } },
                ],
              },
            },
          },
        ],
      },
    ],
  },
};
