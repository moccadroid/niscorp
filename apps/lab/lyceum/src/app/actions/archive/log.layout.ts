import type { LayoutNode } from '@niscorp/nova';

export const logLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'table'], rows: ['auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'live' }, children: [{ component: 'Label', children: 'Archive · the history' }] },
    {
      component: 'Cell',
      props: { area: 'table', pad: 'none' },
      children: [
        {
          component: 'Rows',
          props: {
            rows: '$.rows',
            rowKey: 'member_id',
            empty: 'Nothing has happened yet.',
            columns: [
              { label: 'Arrived', key: 'arrived', kind: 'mono', w: 1.1 },
              { label: 'Name', key: 'name', w: 2 },
              { label: 'Went to', key: 'department_name', w: 1.4, missing: '—' },
              { label: 'At', key: 'assigned', kind: 'mono', w: 1.1, missing: '—' },
            ],
          },
        },
      ],
    },
  ],
};
