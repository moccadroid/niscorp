import type { ActionDefinition } from '@niscorp/nova';
import { conversationLayout } from './conversation.layout';

export const conversationAction: ActionDefinition = {
  id: 'ask.conversation',
  title: 'Conversation',
  description: 'The conversation: everything the person asked and what was said back, the oldest first, opening at the newest; pressing something asked opens the answer it was, or the screen it was asked on.',
  data: { exchanges: [] },
  layout: conversationLayout,
  endpoints: { said: { fn: 'answers.conversation', target: 'exchanges' } },
  lifecycle: { mount: [{ call: 'said' }] },
  triggers: [
    { event: 'ui:click', ref: 'opens-answer', do: [{ emit: { channel: 'go', payload: '@event.payload' } }] },
    { event: 'ui:click', ref: 'opens-screen', do: [{ emit: { channel: 'open', payload: '@event.payload' } }] },
  ],
};
