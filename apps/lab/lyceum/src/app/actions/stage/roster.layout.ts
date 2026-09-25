import type { LayoutNode } from '@niscorp/nova';

export const rosterLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 12, p: 24 },
  children: [
    { component: 'Text', props: { as: 'h1' }, children: 'The room' },
    {
      component: 'Table',
      props: {
        rows: '$.rows',
        rowKey: 'member_id',
        empty: 'Nobody yet. Scan the code.',
        columns: [
          { label: 'Name', cell: { key: 'name' } },
          { label: 'House', cell: { key: 'house_name' } },
        ],
      },
    },
  ],
};
