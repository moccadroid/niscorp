import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { messageLayout } from './message.layout';
import { threadPrism, sendMessagePrism } from './stay.prism';

export const stayMessageAction: ActionDefinition = {
  id: 'stay.message',
  title: 'Message the desk',
  data: { stayId: '', propertyId: '', capability: '', sheetTitle: '', thread: [], draft: '', loading: true },
  layout: messageLayout,
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: threadPrism, target: 'thread' },
    send: { url: '/api/stay/vex', method: 'POST', request: sendMessagePrism },
    mark: { url: '/api/vex', method: 'POST', request: { fingerprint: 'seen/mark', context: { topic: 'messages' } } },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'mark', onSuccess: [{ emit: { channel: 'messages-changed' } }] }] },
  triggers: [
    { event: 'ui:model', ref: 'draft', do: [{ set: 'draft', value: '@event.payload' }] },
    {
      event: 'ui:click',
      ref: 'send',
      do: [{ call: 'send', onSuccess: [{ set: 'draft', value: '' }, { call: 'load' }, { emit: { channel: 'messages-changed' } }] }],
    },
    { message: 'messages-changed', do: [{ call: 'load' }] },
  ],
};

export const stayMessageInputSchema = z.toJSONSchema(
  z.object({
    capability: z.string().optional().describe('The capability that placed the slot which opened this.'),
    stayId: z.string().optional(),
    propertyId: z.string().optional(),
    sheetTitle: z.string().optional(),
    draft: z.string().optional().describe('Prefill the composer — the guest reads, edits, and presses send themselves.'),
  }),
);
