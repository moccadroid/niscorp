import type { ActionDefinition } from '@niscorp/nova';
import { departmentsTally } from '@lyceum/app/vex/member.entries';

// The controller's second tool on the assignment slide, under Assign: how many
// people each department has. A reactive read, so it fills in as the room is
// assigned.
export const tallyTool: ActionDefinition = {
  id: 'tools.tally',
  title: 'Departments so far',
  data: { tally: [] },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick', 'tally'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Departments so far' }] },
      {
        component: 'Cell',
        props: { area: 'tally', pad: 'none' },
        children: [
          {
            component: 'Rows',
            props: {
              rows: '$.tally',
              rowKey: 'department_id',
              empty: 'Nobody assigned yet.',
              columns: [
                { label: 'Department', key: 'department_id', w: 2 },
                { label: 'People', key: 'size', kind: 'mono', w: 1 },
              ],
            },
          },
        ],
      },
    ],
  },
  endpoints: {
    tally: { url: '/api/vex', method: 'POST', request: { fingerprint: departmentsTally.fingerprint, context: {} }, target: 'tally' },
  },
  lifecycle: { mount: [{ call: 'tally' }] },
  triggers: [],
};
