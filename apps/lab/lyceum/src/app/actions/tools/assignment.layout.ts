import type { LayoutNode } from '@niscorp/nova';

export const assignmentToolLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick kick', 'waiting assigned', 'assign unassign'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'For this slide · assignment' }] },
    { component: 'Cell', props: { area: 'waiting' }, children: [{ component: 'Figure', props: { label: 'Waiting', value: '$.counts.unassigned' } }] },
    { component: 'Cell', props: { area: 'assigned', ink: 'live' }, children: [{ component: 'Figure', props: { label: 'Assigned', value: '$.counts.assigned' } }] },
    {
      component: 'Action',
      ref: 'assign',
      props: { area: 'assign', ink: 'signal', label: { $if: '$.working', $then: 'Assigning…', $else: 'Assign the room' } },
    },
    { component: 'Action', ref: 'unassign', props: { area: 'unassign', label: 'Unassign (testing)' } },
  ],
};
