import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { pushComposeLayout } from './push-compose.layout';
import { pushesRecentPrism, pushSendPrism } from './do.prism';

// DRAFT A PUSH — the card where the two speeds meet.
//
// The FAST model picks who it goes to and how loud it is; it does not write it,
// because a decision model returns no strings. So the draft it opens with is
// the operator's own sentence (`parse: 'line'`) — the one thing on this form
// that cannot be wrong about what is happening, and on screen in milliseconds.
//
// `body` also carries `write: true`, which is the whole of this card's part in
// the slow path: a text model MAY replace that draft with words meant for
// attendees, seconds later — unless a person has typed in the field first, in
// which case neither speed touches it again.
//
// `urgency` is a bounded integer WITHOUT `parse`, so it becomes a three-level
// `score`, and `levels` gives the steps their words. Compare `set.delay`'s
// minutes, which is the same JSON Schema type and a completely different kind
// of value.
export const pushComposeAction: ActionDefinition = {
  id: 'push.compose',
  title: 'Push to attendees',
  description: 'The form that drafts a push notification to attendees or crew — pick the audience and how urgent it is; open it when the operator wants to warn, tell, alert or notify people of something.',
  data: { audience: 'everyone', urgency: 0, body: '', recent: [], saved: false, error: '' },
  layout: pushComposeLayout,
  endpoints: {
    loadRecent: { url: '/api/ledger/vex', method: 'POST', request: pushesRecentPrism, target: 'recent' },
    send: { url: '/api/ledger/vex', method: 'POST', request: pushSendPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'loadRecent' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'submit',
      do: [{ set: 'error', value: '' }, { call: 'send', onSuccess: [{ set: 'saved', value: true }] }],
    },
  ],
};

export const pushComposeInputSchema = z.toJSONSchema(
  z.object({
    audience: z
      .enum(['everyone', 'arena', 'tent', 'campsite', 'vendors', 'crew'])
      .optional()
      .describe('Who receives it: everyone on site, people in the main arena, people at the tent, the campsite, the vendors, or the crew.'),
    urgency: z
      .number()
      .int()
      .min(0)
      .max(2)
      .optional()
      .describe('How urgent the message is, which sets how loudly a phone announces it.')
      .meta({ levels: ['routine', 'important', 'critical'] }),
    body: z.string().optional().describe('The text of the message, as attendees will read it on their phones: one or two plain sentences, what is happening and what to do.').meta({ parse: 'line', write: true }),
  }),
);
