import type { LayoutNode } from '@niscorp/nova';

// How many people each department has, filling in as the room is assigned.
export const tallyLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick', 'tally'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Departments so far' }] },
    {
      component: 'Cell',
      props: { area: 'tally', pad: 'none' },
      children: [
        {
          component: 'Rows',
          props: {
            rows: '$.tally',
            rowKey: 'department_id',
            empty: 'Nobody assigned yet.',
            columns: [
              { label: 'Department', key: 'department_id', w: 2 },
              { label: 'People', key: 'size', kind: 'mono', w: 1 },
            ],
          },
        },
      ],
    },
  ],
};
