import type { LayoutNode } from '@niscorp/nova';

export const stripLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['brand slide room sorted'], cols: [1, 5, 1.4, 1.4] },
  children: [
    { component: 'Cell', props: { area: 'brand' }, children: [{ component: 'Label', children: 'Lyceum' }] },
    { component: 'Cell', props: { area: 'slide' }, children: [{ component: 'Label', children: '{{$.current.number}} / {{$.count.slides}} · {{$.current.title}}' }] },
    { component: 'Cell', props: { area: 'room', ink: 'live' }, children: [{ component: 'Label', children: '{{$.counts.joined}} in' }] },
    { component: 'Cell', props: { area: 'sorted', ink: 'signal' }, children: [{ component: 'Label', children: '{{$.counts.sorted}} sorted' }] },
  ],
};
