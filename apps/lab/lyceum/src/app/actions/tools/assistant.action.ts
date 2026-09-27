import type { ActionDefinition } from '@niscorp/nova';
import { timerSave } from '@lyceum/app/vex/timer.entries';
import { assistantLayout } from './assistant.layout';

// THE SPEAKER'S ASSISTANT, first form — the talk's opening minute. The speaker
// asks for an automation in words ("end the talk in 30 minutes"); a model writes
// it as a tide reflex and the document comes back to be READ; Save writes it as
// the speaker's own row and arms it. From then on it runs with no model.
//
//   propose  server/functions/assistant.functions.ts — the model's choice
//   save     `timers/save`, straight to vex, as the speaker
//   arm      loads the saved timers into tide
export const assistantTool: ActionDefinition = {
  id: 'tools.assistant',
  title: 'Assistant',
  data: {
    draft: '',
    proposal: { timerId: '', reflex: {}, json: '', intent: '', dueAt: null, dueLocal: '' },
    proposing: false,
    proposed: false,
    saved: false,
    error: '',
  },
  layout: assistantLayout,
  endpoints: {
    propose: { fn: 'assistant.propose', target: 'proposal', errorTarget: 'error' },
    save: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: timerSave.fingerprint,
        context: {
          timerId: { $ref: '$.proposal.timerId' },
          reflex: { $ref: '$.proposal.reflex' },
          intent: { $ref: '$.proposal.intent' },
          dueAt: { $ref: '$.proposal.dueAt' },
        },
      },
      errorTarget: 'error',
    },
    arm: { fn: 'timers.arm', errorTarget: 'error' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'ask',
      do: [
        { set: 'error', value: '' },
        { set: 'saved', value: false },
        { set: 'proposed', value: false },
        { set: 'proposing', value: true },
        {
          call: 'propose',
          onSuccess: [{ set: 'proposed', value: true }, { set: 'proposing', value: false }],
          onError: [{ set: 'proposing', value: false }],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'save',
      do: [{ set: 'error', value: '' }, { call: 'save', onSuccess: [{ call: 'arm', onSuccess: [{ set: 'saved', value: true }] }] }],
    },
  ],
};
