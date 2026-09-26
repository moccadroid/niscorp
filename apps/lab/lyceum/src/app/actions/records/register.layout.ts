import type { LayoutNode } from '@niscorp/nova';

export const registerLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'table'], rows: ['auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'live' }, children: [{ component: 'Label', children: 'Records · the register' }] },
    {
      component: 'Cell',
      props: { area: 'table', pad: 'none' },
      children: [
        {
          component: 'Rows',
          props: {
            rows: '$.rows',
            rowKey: 'member_id',
            empty: 'Nobody yet.',
            columns: [
              { label: '', key: 'department_sigil', kind: 'sigil', w: 0.4 },
              { label: 'Name', key: 'name', w: 2 },
              { label: 'Department', key: 'department_name', w: 1.6, missing: 'waiting' },
            ],
          },
        },
      ],
    },
  ],
};
