import type { LayoutNode } from '@niscorp/nova';

export const stripLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['join room'], cols: [4, 1] },
  children: [
    { component: 'Cell', props: { area: 'join', ink: 'highlight' }, children: [{ component: 'Label', children: 'Join: {{$.address.host}}' }] },
    { component: 'Cell', props: { area: 'room', ink: 'live' }, children: [{ component: 'Label', children: '{{$.counts.joined}} joined' }] },
  ],
};
