import type { LayoutNode } from '@niscorp/nova';

// Who you are in the room. Until the sorting, the place where the house goes
// is hatched: "not yet" has a pattern, not a grey.
export const cardLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'name', 'status'], rows: ['auto', 1, 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'You' }] },
    {
      component: 'Cell',
      props: { area: 'name', align: 'end' },
      children: [{ component: 'Headline', props: { level: 'title' }, children: '{{$.me.name}}' }],
    },
    {
      if: '$.me.house_name',
      then: { component: 'Cell', props: { area: 'status' }, children: [{ component: 'Label', children: 'House {{$.me.house_name}}' }] },
      else: {
        component: 'Cell',
        props: { area: 'status', mark: 'hatch' },
        children: [{ component: 'Text', children: 'Not yet sorted. Wait for the sorting.' }],
      },
    },
  ],
};
