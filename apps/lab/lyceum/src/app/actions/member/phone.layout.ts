import type { LayoutNode } from '@niscorp/nova';

// THE PHONE'S ARRANGEMENT (the controller's pattern, speaker/console.layout.ts).
// Who you are across the top, always; one thing at a time in the body, which
// scrolls inside itself; the bar where the thumb is — a button for each thing
// the person has, the open one inked. Nothing on the phone scrolls away but
// the body.
export const phoneLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['self', 'body', 'bar'], rows: ['auto', 1, 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'self' }, children: [{ component: 'Label', children: '{{$.me.name}}' }] },
    { component: 'Cell', props: { area: 'body', pad: 'none', scroll: 'y' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'body' } }] },
    {
      component: 'Cell',
      props: { area: 'bar', pad: 'none' },
      children: [
        {
          component: 'Sheet',
          props: { areas: '$.bar.areas' },
          children: [
            {
              for: '$.bar.tabs',
              as: 'tab',
              do: {
                component: 'Action',
                ref: 'tab',
                props: { area: '$tab.area', ink: { $if: { $eq: ['$tab.action', '$.open'] }, $then: 'ink', $else: 'paper' }, label: '{{$tab.label}}', value: '$tab.action' },
              },
            },
          ],
        },
      ],
    },
  ],
};
