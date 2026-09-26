import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { assignmentToolLayout } from './assignment.layout';

// The controller's tool while the assignment slides are up: put the room into
// departments, or (testing) take everybody back out. Mounted on the speaker's
// `tools` canvas by the speaker's deck when a slide lists it (`slide_tools`).
export const assignmentTool: ActionDefinition = {
  id: 'tools.assignment',
  title: 'Assignment',
  data: { counts: { joined: 0, assigned: 0, unassigned: 0 }, working: false, error: '' },
  layout: assignmentToolLayout,
  endpoints: {
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
    assign: { fn: 'speaker.assign', errorTarget: 'error' },
    unassign: { fn: 'speaker.unassign', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'counts' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'assign',
      do: [
        { set: 'working', value: true },
        { set: 'error', value: '' },
        { call: 'assign', onSuccess: [{ set: 'working', value: false }], onError: [{ set: 'working', value: false }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'unassign',
      do: [
        { set: 'working', value: true },
        { set: 'error', value: '' },
        { call: 'unassign', onSuccess: [{ set: 'working', value: false }], onError: [{ set: 'working', value: false }] },
      ],
    },
  ],
};
