import type { ActionDefinition } from '@niscorp/nova';
import { deckStep, deckStepSet, TALK_DECK } from '@lyceum/app/vex/deck.entries';

export const stepTool: ActionDefinition = {
  id: 'tools.step',
  title: 'This slide, in steps',
  data: { step: { step: 0, parts: 1, part: 1 }, error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'more over', 'at at'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'This slide, in steps' }] },
      { component: 'Action', ref: 'more', props: { area: 'more', ink: 'signal', label: 'Show the next part' } },
      { component: 'Action', ref: 'over', props: { area: 'over', ink: 'paper', label: 'Start over' } },
      {
        component: 'Cell',
        props: { area: 'at' },
        children: [{ component: 'Figure', props: { label: 'Showing part', value: '{{$.step.part}} of {{$.step.parts}}' } }, { if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' } }],
      },
    ],
  },
  endpoints: {
    step: { url: '/api/vex', method: 'POST', request: { fingerprint: deckStep.fingerprint, context: {} }, target: 'step' },
    more: { url: '/api/vex', method: 'POST', request: { fingerprint: deckStepSet.fingerprint, context: { deck: TALK_DECK, step: { $min: { over: [{ $add: [{ $ref: '$.step.step' }, 1] }, { $sub: [{ $ref: '$.step.parts' }, 1] }] } } } }, errorTarget: 'error' },
    over: { url: '/api/vex', method: 'POST', request: { fingerprint: deckStepSet.fingerprint, context: { deck: TALK_DECK, step: 0 } }, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'step' }] },
  triggers: [
    { event: 'ui:click', ref: 'more', do: [{ set: 'error', value: '' }, { call: 'more' }] },
    { event: 'ui:click', ref: 'over', do: [{ set: 'error', value: '' }, { call: 'over' }] },
  ],
};
