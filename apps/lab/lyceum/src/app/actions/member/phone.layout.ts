import type { LayoutNode } from '@niscorp/nova';

// THE PHONE'S ARRANGEMENT (the controller's pattern, speaker/console.layout.ts).
// Who you are across the top, always; in the middle the LIST of what this
// phone holds (the `body` list canvas), one action under another, scrolling
// inside itself; the bar where the thumb is — at most two buttons, each inked
// while its action is on the list. Nothing on the phone scrolls away but the
// list.
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
                props: { area: '$tab.area', ink: { $if: '$tab.on', $then: 'ink', $else: 'paper' }, label: '{{$tab.label}}', value: '$tab.action' },
              },
            },
            {
              for: '$.bar.switches',
              as: 'switch',
              do: { component: 'Action', ref: 'xray', props: { area: '$switch.area', ink: { $if: '$.xray', $then: 'signal', $else: 'paper' }, label: 'X-ray' } },
            },
          ],
        },
      ],
    },
  ],
};
