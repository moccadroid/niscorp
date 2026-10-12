import { LINE_TYPE_CHANNEL } from './assist-answer.action';
import type { ActionDefinition } from '@niscorp/nova';
import { intentLineLayout } from './intent-line.layout';

export const intentLineAction: ActionDefinition = {
  id: 'intent.line',
  title: 'Intent',
  description: 'The line the operator types what is happening into; the room assembles itself around it.',
  data: { text: '', generation: 0, tone: 'calm', ran: '', warmed: '', heard: [] },
  layout: intentLineLayout,
  endpoints: {
    decide: { fn: 'encore.intent', target: 'generation' },
    runNow: { fn: 'encore.run', target: 'ran' },
    warm: { fn: 'encore.warm', target: 'warmed' },
  },
  triggers: [
    { event: 'ui:model', ref: 'line', do: [{ call: 'decide' }] },
    { event: 'ui:key', ref: 'line', key: 'Enter', do: [{ call: 'runNow' }] },
    { event: 'ui:focus', ref: 'line', do: [{ call: 'warm' }] },
    { message: LINE_TYPE_CHANNEL, do: [{ set: 'text', value: '@event.payload' }, { call: 'decide' }] },
  ],
};
