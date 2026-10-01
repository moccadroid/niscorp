import type { LayoutNode } from '@niscorp/nova';

// The room, the slide on screen, and the time left on the newest timer — and,
// in the corner, the controller's menu: what is not for any one slide.
export const headLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['room menu', 'slide timer'], cols: [3, 1] },
  children: [
    { component: 'Cell', props: { area: 'room' }, children: [{ component: 'Label', children: 'Controller · {{$.counts.joined}} joined' }] },
    { component: 'Menu', props: { area: 'menu', label: 'Menu' }, children: [{ component: 'Action', ref: 'reset', props: { ink: 'paper', label: 'Reset' } }] },
    {
      component: 'Cell',
      props: { area: 'slide' },
      children: [
        { component: 'Label', children: 'On screen · slide {{$.current.number}} of {{$.current.count}}' },
        { component: 'Headline', props: { level: 'name' }, children: '{{$.current.title}}' },
      ],
    },
    {
      if: '$.timer.due_at',
      then: { component: 'Cell', props: { area: 'timer', ink: 'live' }, children: [{ component: 'Countdown', props: { label: 'Timer', to: '$.timer.due_at' } }] },
      else: { component: 'Cell', props: { area: 'timer', mark: 'hatch' }, children: [{ component: 'Label', children: 'No timer' }] },
    },
  ],
};
