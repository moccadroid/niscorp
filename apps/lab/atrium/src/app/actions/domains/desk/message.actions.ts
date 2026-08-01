import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { messageTileLayout, messageListLayout, threadDetailLayout } from './message.layouts';
import { inboxPrism, threadByStayPrism, replyByStayPrism } from './desk.prism';

// The message family: the tile, the inbox, and one conversation.
//
// Every part takes its subject as declared input, which is what makes a
// conversation reachable by a push, a link or the assistant rather than only by
// a finger.

// ── tile: what is waiting ───────────────────────────────────
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

// ── list: the inbox, and nothing else ───────────────────────
export const messageListAction: ActionDefinition = {
  id: 'desk.message.list',
  title: 'Messages',
  data: { propertyId: '', feed: [], loading: true },
  layout: messageListLayout,
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: inboxPrism, target: 'feed' },
    // Looking is the write: opening the inbox marks everything seen.
    mark: { url: '/api/vex', method: 'POST', request: { fingerprint: 'seen/mark', context: { topic: 'messages' } } },
  },
  lifecycle: {
    mount: [
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'mark', onSuccess: [{ emit: { channel: 'messages-changed' } }] },
    ],
  },
  triggers: [
    // A row opens the CONVERSATION in the record column, beside the inbox — the
    // feed stays where it was. `resetTo`, so picking another guest replaces the
    // conversation instead of stacking two of them.
    { event: 'ui:click', ref: 'open-thread', do: [{ resetTo: { action: 'desk.thread.detail', canvas: 'detail', input: { stayId: '@event.payload.stay_id', guestName: '@event.payload.guest_name' }, with: ['detail'] } }] },
    { message: 'messages-changed', do: [{ call: 'load' }] },
  ],
};

export const messageListInputSchema = z.toJSONSchema(
  z.object({ propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.') }),
);

// ── detail: ONE conversation, read and answered in place ────
export const threadDetailAction: ActionDefinition = {
  id: 'desk.thread.detail',
  title: 'The conversation',
  data: { stayId: '', guestName: '', draft: '', drafted: '', reading: '', thread: [], working: false, loading: true },
  layout: threadDetailLayout,
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: threadByStayPrism, target: 'thread' },
    send: { url: '/api/stay/vex', method: 'POST', request: replyByStayPrism },
  },
  // `load` writes only `thread`, so words handed in as `draft` survive the mount
  // and sit in the box. Nothing here asks anybody for a suggestion: the
  // assistant writes one when it judges one is wanted, through the same answer
  // it uses for everything else.
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    // CLOSE, not back — see the issue record. The inbox stays on `work`.
    { event: 'ui:click', ref: 'close', do: [{ pop: true }] },
    // Their own words from here on: the "drafted for you" note goes the moment
    // they touch the box, because after that it is not drafted, it is theirs.
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
            // Emptied, not CLEARED: `clear` removes the key, and a textarea whose
            // model went undefined stops being controlled.
            { set: 'draft', value: '' },
            { set: 'drafted', value: '' },
            // The thread is right here, so the sent reply lands in it rather
            // than the clerk being sent back somewhere to look at it.
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
