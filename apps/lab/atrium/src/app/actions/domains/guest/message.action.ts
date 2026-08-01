import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { messageLayout } from './message.layout';
import { threadPrism, sendMessagePrism } from './stay.prism';

// The thread with the desk. This is the surface a guest reaches for when
// something is wrong, and it is where the demo's causal line starts: what is
// typed here lands on a clerk's board.
//
// Nothing here can promise anything. There is no comp control, no upgrade
// control and no refund control, because the guest role holds no verb that
// would grant one — a request for a discount becomes a line the desk reads, and
// the desk's own surface is where the authority to answer it lives.
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
