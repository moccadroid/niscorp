import type { ActionDefinition } from '@niscorp/nova';
import { memberRegister } from '@lyceum/app/vex/member.entries';
import { xrayGive, xrayGiven, xrayTake } from '@lyceum/app/vex/grant.entries';

// The controller's X-ray: give it to everybody who has joined, or take it back.
// Giving writes a grant row per member (vex/grant.entries.ts); their shells are
// rebuilt with it and the X-ray button is on their phones. Taking it back
// deletes the rows, and it is gone the same way. How many have it is a
// reactive read, so the tool follows.
export const xrayTool: ActionDefinition = {
  id: 'tools.xray',
  title: 'The X-ray',
  data: { members: [], xray: { count: 0, given: false }, error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'give take', 'count count'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'X-ray — everybody’s own screen, as data' }] },
      { component: 'Action', ref: 'give', props: { area: 'give', ink: { $if: '$.xray.given', $then: 'highlight', $else: 'signal' }, label: 'Give everybody the X-ray' } },
      { component: 'Action', ref: 'take', props: { area: 'take', ink: 'paper', label: 'Take it back' } },
      {
        component: 'Cell',
        props: { area: 'count' },
        children: [
          { component: 'Figure', props: { label: 'People who have it', value: '$.xray.count' } },
          { if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' } },
        ],
      },
    ],
  },
  endpoints: {
    members: { url: '/api/vex', method: 'POST', request: { fingerprint: memberRegister.fingerprint, context: {} }, target: 'members' },
    given: { url: '/api/vex', method: 'POST', request: { fingerprint: xrayGiven.fingerprint, context: {} }, target: 'xray' },
    give: { url: '/api/vex', method: 'POST', request: { fingerprint: xrayGive.fingerprint, context: { members: { $ref: '$.members' } } }, errorTarget: 'error' },
    take: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: xrayTake.fingerprint, context: { members: { $pluck: { over: { $ref: '$.members' }, key: 'member_id' } } } },
      errorTarget: 'error',
    },
  },
  lifecycle: { mount: [{ call: 'members' }, { call: 'given' }] },
  triggers: [
    { event: 'ui:click', ref: 'give', do: [{ set: 'error', value: '' }, { call: 'give' }] },
    { event: 'ui:click', ref: 'take', do: [{ set: 'error', value: '' }, { call: 'take' }] },
  ],
};
