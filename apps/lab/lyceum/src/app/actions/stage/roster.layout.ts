import type { LayoutNode } from '@niscorp/nova';

// The room, as a slide: everybody here as a ruled table — their house's sigil,
// their name, their house or the lack of one — and the count beside it.
export const rosterLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick count', 'head count', 'table bar', 'table bar'], cols: [3, 1], rows: ['auto', 'auto', 1, 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'The room' }] },
    { component: 'Cell', props: { area: 'head' }, children: [{ component: 'Headline', props: { level: 'title' }, children: 'Everybody who stepped in' }] },
    {
      component: 'Cell',
      props: { area: 'count', ink: 'signal', align: 'between' },
      children: [
        { component: 'Figure', props: { label: 'In the room', value: '$.counts.joined' } },
        { component: 'Label', children: '{{$.counts.sorted}} sorted' },
      ],
    },
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
              { label: '', key: 'house_sigil', kind: 'sigil', w: 0.35 },
              { label: 'Name', key: 'name', w: 3 },
              { label: 'House', key: 'house_name', w: 2, missing: 'not yet sorted' },
            ],
          },
        },
      ],
    },
    {
      component: 'Cell',
      props: { area: 'bar', align: 'end' },
      children: [
        { component: 'Label', children: 'Sorted / not yet' },
        {
          component: 'Bar',
          props: { segments: [{ value: '$.counts.sorted', ink: 'signal' }, { value: '$.counts.unsorted', mark: 'hatch' }] },
        },
      ],
    },
  ],
};
