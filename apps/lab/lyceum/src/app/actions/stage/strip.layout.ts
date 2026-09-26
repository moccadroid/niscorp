import type { LayoutNode } from '@niscorp/nova';

export const stripLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['brand slide join room'], cols: [1, 4, 2, 1.4] },
  children: [
    { component: 'Cell', props: { area: 'brand' }, children: [{ component: 'Label', children: 'Lyceum' }] },
    { component: 'Cell', props: { area: 'slide' }, children: [{ component: 'Label', children: '{{$.current.number}} / {{$.current.count}} · {{$.current.title}}' }] },
    { component: 'Cell', props: { area: 'join', ink: 'highlight' }, children: [{ component: 'Label', children: '{{$.address.host}}' }] },
    { component: 'Cell', props: { area: 'room', ink: 'live' }, children: [{ component: 'Label', children: '{{$.counts.joined}} in the room' }] },
  ],
};
