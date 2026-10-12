import type { ActionDefinition } from '@niscorp/nova';
import { buttonGive, buttonGiven, buttonHolders, buttonTake } from '@lyceum/app/vex/grant.entries';

export const buttonTool: ActionDefinition = {
  id: 'tools.button',
  title: 'The button',
  data: { picked: [], holders: [], button: { count: 0, given: false }, error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'give take', 'count count'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'The button — an action only some people have' }] },
      { component: 'Action', ref: 'give', props: { area: 'give', ink: { $if: '$.button.given', $then: 'highlight', $else: 'signal' }, label: 'Give it to a quarter of the room' } },
      { component: 'Action', ref: 'take', props: { area: 'take', ink: 'paper', label: 'Take it back' } },
      {
        component: 'Cell',
        props: { area: 'count' },
        children: [
          { component: 'Figure', props: { label: 'People who have it', value: '$.button.count' } },
          { if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' } },
        ],
      },
    ],
  },
  endpoints: {
    given: { url: '/api/vex', method: 'POST', request: { fingerprint: buttonGiven.fingerprint, context: {} }, target: 'button' },
    pick: { fn: 'button.pick', target: 'picked', errorTarget: 'error' },
    give: { url: '/api/vex', method: 'POST', request: { fingerprint: buttonGive.fingerprint, context: { members: { $ref: '$.picked' } } }, errorTarget: 'error' },
    holders: { url: '/api/vex', method: 'POST', request: { fingerprint: buttonHolders.fingerprint, context: {} }, target: 'holders' },
    take: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: buttonTake.fingerprint, context: { members: { $pluck: { over: { $ref: '$.holders' }, key: 'principal' } } } },
      errorTarget: 'error',
    },
  },
  lifecycle: { mount: [{ call: 'given' }, { call: 'holders' }] },
  triggers: [
    { event: 'ui:click', ref: 'give', do: [{ set: 'error', value: '' }, { call: 'pick', onSuccess: [{ call: 'give' }] }] },
    { event: 'ui:click', ref: 'take', do: [{ set: 'error', value: '' }, { call: 'take' }] },
  ],
};
