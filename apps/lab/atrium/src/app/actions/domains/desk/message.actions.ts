import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { messageTileLayout, messageListLayout, threadDetailLayout } from './message.layouts';
import { inboxPrism, threadByStayPrism, replyByStayPrism } from './desk.prism';

export const messageTileAction: ActionDefinition = {
  id: 'desk.message.tile',
  title: 'Messages',
  data: { propertyId: '', feed: [] },
  layout: messageTileLayout,
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: inboxPrism, target: 'feed' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ push: { action: 'desk.message.list', canvas: 'work', input: { propertyId: '$.propertyId' } } }] },
    { message: 'messages-changed', do: [{ call: 'load' }] },
  ],
};

export const messageTileInputSchema = z.toJSONSchema(
  z.object({ propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.') }),
);

export const messageListAction: ActionDefinition = {
  id: 'desk.message.list',
  title: 'Messages',
  data: { propertyId: '', feed: [], loading: true },
  layout: messageListLayout,
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: inboxPrism, target: 'feed' },
    mark: { url: '/api/vex', method: 'POST', request: { fingerprint: 'seen/mark', context: { topic: 'messages' } } },
  },
  lifecycle: {
    mount: [
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'mark', onSuccess: [{ emit: { channel: 'messages-changed' } }] },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'open-thread', do: [{ resetTo: { action: 'desk.thread.detail', canvas: 'detail', input: { stayId: '@event.payload.stay_id', guestName: '@event.payload.guest_name' }, with: ['detail'] } }] },
    { message: 'messages-changed', do: [{ call: 'load' }] },
  ],
};

export const messageListInputSchema = z.toJSONSchema(
  z.object({ propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.') }),
);

export const threadDetailAction: ActionDefinition = {
  id: 'desk.thread.detail',
  title: 'The conversation',
  data: { stayId: '', guestName: '', draft: '', drafted: '', reading: '', thread: [], working: false, loading: true },
  layout: threadDetailLayout,
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: threadByStayPrism, target: 'thread' },
    send: { url: '/api/stay/vex', method: 'POST', request: replyByStayPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:click', ref: 'close', do: [{ pop: true }] },
    { event: 'ui:model', ref: 'draft', do: [{ set: 'draft', value: '@event.payload' }, { set: 'drafted', value: '' }] },
    {
      event: 'ui:click',
      ref: 'send',
      do: [
        { set: 'working', value: true },
        {
          call: 'send',
          onSuccess: [
            { set: 'working', value: false },
            { set: 'draft', value: '' },
            { set: 'drafted', value: '' },
            { call: 'load' },
            { emit: { channel: 'messages-changed' } },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    { message: 'messages-changed', do: [{ call: 'load' }] },
  ],
};

export const threadDetailInputSchema = z.toJSONSchema(
  z.object({
    stayId: z.string().describe('The stay whose conversation to open. This is what makes a thread reachable by a push, a link or the assistant.'),
    guestName: z.string().optional().describe('Whose conversation it is, for the heading — the thread reads without a second lookup.'),
    draft: z
      .string()
      .optional()
      .describe(
        'The reply, ALREADY WRITTEN, sitting in the box for the user to read and send. Write it in the language the guest is writing in. An empty box leaves the writing to the user; the words in it are the offer. Nothing is sent until the user presses the button.',
      ),
    drafted: z.string().optional().describe('Set this to the same text as `draft` when the words are yours, so the box says so. Leave it out when you are only re-opening a conversation.'),
    reading: z
      .string()
      .optional()
      .describe(
        'ONE short line on how this conversation is GOING, shown beside the composer and marked as yours: "third message about the same fault, nothing back for four hours". A reading, not a score — say what you notice, never rate the guest. Leave it out when the thread speaks for itself.',
      ),
  }),
);
