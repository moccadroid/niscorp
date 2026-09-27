import type { ActionDefinition } from '@niscorp/nova';
import { departmentsTally } from '@lyceum/app/vex/member.entries';
import { tallyLayout } from './tally.layout';

// The controller's second tool on the assignment slide, under Assign: how many
// people each department has. A reactive read, so it fills in as the room is
// assigned.
export const tallyTool: ActionDefinition = {
  id: 'tools.tally',
  title: 'Departments so far',
  data: { tally: [] },
  layout: tallyLayout,
  endpoints: {
    tally: { url: '/api/vex', method: 'POST', request: { fingerprint: departmentsTally.fingerprint, context: {} }, target: 'tally' },
  },
  lifecycle: { mount: [{ call: 'tally' }] },
  triggers: [],
};
