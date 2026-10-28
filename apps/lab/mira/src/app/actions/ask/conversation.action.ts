import type { ActionDefinition } from '@niscorp/nova';
import { conversationLayout } from './conversation.layout';

export const conversationAction: ActionDefinition = {
  id: 'ask.conversation',
  title: 'Conversation',
  description: 'Everything the person asked and what was said back, the newest first; pressing one opens the answer it was, or the screen it was asked on.',
  data: { exchanges: [] },
  layout: conversationLayout,
  endpoints: { said: { fn: 'answers.conversation', target: 'exchanges' } },
  lifecycle: { mount: [{ call: 'said' }] },
  triggers: [
    { event: 'ui:click', ref: 'opens-answer', do: [{ emit: { channel: 'go', payload: '@event.payload' } }] },
    { event: 'ui:click', ref: 'opens-screen', do: [{ emit: { channel: 'open', payload: '@event.payload' } }] },
  ],
};
