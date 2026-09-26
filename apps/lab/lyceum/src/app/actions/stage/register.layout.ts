import type { LayoutNode } from '@niscorp/nova';

// Everybody who stepped in as a ruled table — their department's sigil, their
// name, their title, their department or the lack of one — and the count.
export const registerLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick count', 'head count', 'table table'], cols: [3, 1], rows: ['auto', 'auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'The register' }] },
    { component: 'Cell', props: { area: 'head' }, children: [{ component: 'Headline', props: { level: 'title' }, children: 'Everybody who stepped in' }] },
    { component: 'Cell', props: { area: 'count', ink: 'live', align: 'end' }, children: [{ component: 'Figure', props: { label: 'In the room', value: '$.counts.joined' } }] },
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
              { label: '', key: 'department_sigil', kind: 'sigil', w: 0.35 },
              { label: 'Name', key: 'name', w: 2.2 },
              { label: 'Title', key: 'title', w: 3, missing: 'being issued' },
              { label: 'Department', key: 'department_name', w: 1.5, missing: 'waiting' },
            ],
          },
        },
      ],
    },
  ],
};
