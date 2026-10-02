import type { ActionDefinition } from '@niscorp/nova';
import { deckStep, deckStepSet, TALK_DECK } from '@lyceum/app/vex/deck.entries';

// The controller's step tool, on the slides that are shown in steps: one press
// shows the next part of the slide on the stage, another starts it over. The
// step is the deck row's (vex/deck.entries.ts) — a reactive read, so the tool
// and the stage both follow; moving the deck puts it back to 0.
export const stepTool: ActionDefinition = {
  id: 'tools.step',
  title: 'This slide, in steps',
  data: { step: { step: 0 }, error: '' },
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
        children: [{ component: 'Figure', props: { label: 'Parts shown', value: '$.step.step' } }, { if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' } }],
      },
    ],
  },
  endpoints: {
    step: { url: '/api/vex', method: 'POST', request: { fingerprint: deckStep.fingerprint, context: {} }, target: 'step' },
    more: { url: '/api/vex', method: 'POST', request: { fingerprint: deckStepSet.fingerprint, context: { deck: TALK_DECK, step: { $add: [{ $ref: '$.step.step' }, 1] } } }, errorTarget: 'error' },
    over: { url: '/api/vex', method: 'POST', request: { fingerprint: deckStepSet.fingerprint, context: { deck: TALK_DECK, step: 0 } }, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'step' }] },
  triggers: [
    { event: 'ui:click', ref: 'more', do: [{ set: 'error', value: '' }, { call: 'more' }] },
    { event: 'ui:click', ref: 'over', do: [{ set: 'error', value: '' }, { call: 'over' }] },
  ],
};
