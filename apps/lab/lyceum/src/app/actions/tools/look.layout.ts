import type { LayoutNode } from '@niscorp/nova';

// Two buttons, one per kit; the one the room wears now is marked.
export const lookLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick kick', 'poster plain'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'The look — the same trees, another kit' }] },
    { component: 'Action', ref: 'look', props: { area: 'poster', ink: { $if: '$.room.poster', $then: 'highlight', $else: 'paper' }, label: 'Poster', value: 'poster' } },
    { component: 'Action', ref: 'look', props: { area: 'plain', ink: { $if: '$.room.plain', $then: 'highlight', $else: 'paper' }, label: 'Plain HTML', value: 'plain' } },
  ],
};
