import type { ActionDefinition } from '@niscorp/nova';
import { LINE_TYPE_CHANNEL } from './assist-answer.action';
import { intentOptionsLayout } from './intent-options.layout';

export const intentOptionsAction: ActionDefinition = {
  id: 'intent.options',
  title: 'Maybe',
  description: 'Cards the model is unsure about, offered as chips the operator can promote with a click.',
  data: { chips: [], suggested: [], links: [], stepsUp: false, say: '', idle: 'Nothing needs attention right now. Say what is happening.', promoteId: '', promoted: 0 },
  layout: intentOptionsLayout,
  endpoints: {
    promote: { fn: 'encore.promote', target: 'promoted' },
  },
  triggers: [
    { event: 'ui:click', ref: 'link', do: [{ emit: { channel: LINE_TYPE_CHANNEL, payload: '@event.payload' } }] },
    {
      event: 'ui:click',
      ref: 'chip',
      do: [{ set: 'promoteId', value: '@event.payload' }, { call: 'promote' }],
    },
  ],
};
