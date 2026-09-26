import type { LayoutNode } from '@niscorp/nova';

// The controller, at thumb size: every control is a whole cell. The slide on
// screen, back and next, then the whole deck — press any slide to put it up.
export const consoleLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['head head', 'slide slide', 'back next', 'deck deck'] },
  children: [
    {
      component: 'Cell',
      props: { area: 'head' },
      children: [{ component: 'Label', children: 'Controller · {{$.counts.joined}} in the room · {{$.counts.assigned}} assigned' }],
    },
    {
      component: 'Cell',
      props: { area: 'slide', ink: 'ink' },
      children: [
        { component: 'Label', children: 'Slide {{$.current.number}} / {{$.count.slides}} — {{$.current.title}}' },
        { component: 'Headline', props: { level: 'title' }, children: '{{$.current.title}}' },
        { if: '$.error', then: { component: 'Text', children: '{{$.error}}' } },
      ],
    },
    { component: 'Action', ref: 'back', props: { area: 'back', label: '← Back' } },
    { component: 'Action', ref: 'next', props: { area: 'next', ink: 'alert', label: 'Next →' } },
    {
      component: 'Cell',
      props: { area: 'deck', pad: 'none' },
      children: [
        {
          component: 'Sheet',
          props: { areas: ['kick'] },
          children: [
            { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'The deck — press a slide to put it up' }] },
            {
              for: '$.slides',
              as: 'slide',
              key: 'position',
              do: { component: 'Action', ref: 'pick', props: { value: '$slide.position', label: '{{$slide.number}} · {{$slide.title}}' } },
            },
          ],
        },
      ],
    },
  ],
};
