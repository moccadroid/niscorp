import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { requestLayout } from './request.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { deskStayPrism, staffPrism, requestSendPrism } from './desk.prism';

// SOMETHING A GUEST ASKED FOR, sent to whoever does it.
//
// The desk could read an ask, note an ask, and escalate an ask. It could not DO
// one. A guest wanting two extra pillows and breakfast at ten produced a queue
// row saying somebody was waiting and no action that answered it, so the
// assistant reached for the nearest thing whose description sounded close —
// arrival prep, for a guest three days into his stay.
//
// The distinction this action holds, and the reason it is not `desk.issue.*`: an
// ask is not a fault. Nothing is broken, nobody is owed anything, and the guest
// is not complaining. It lands as a task like a dispatch does, because the floor
// works one list.
//
// `title` and `detail` are declared input: the words a guest used are in the
// thread the assistant is reading, and the person on the floor only ever sees
// what reaches this box.
export const deskRequestAction: ActionDefinition = {
  id: 'desk.request',
  title: 'Guest request',
  data: { stayId: '', propertyId: '', stay: {}, staff: [], kind: 'housekeeping', assigneeId: '', title: '', detail: '', drafted: '', loading: true, working: false, done: false, expanded: true },
  layout: previewable(
    crewCard('Guest request', 'sparkle', { $if: '$.done', $then: 'Sent to the floor.', $else: 'Send what they asked for to whoever does it.' }),
    requestLayout,
  ),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: deskStayPrism, target: 'stay' },
    loadStaff: { url: '/api/service/vex', method: 'POST', request: staffPrism, target: 'staff' },
    send: { url: '/api/service/vex', method: 'POST', request: requestSendPrism },
  },
  // The floor is read on mount rather than on the first press, so a card the
  // assistant opens with a trade already chosen arrives with the people on it.
  lifecycle: {
    mount: [
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'loadStaff' },
    ],
  },
  triggers: [
    { event: 'ui:model', ref: 'title', do: [{ set: 'title', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'detail', do: [{ set: 'detail', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'kind', do: [{ set: 'kind', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'assignee', do: [{ set: 'assigneeId', value: '@event.payload' }] },
    {
      event: 'ui:click',
      ref: 'send',
      do: [
        { set: 'working', value: true },
        {
          call: 'send',
          onSuccess: [
            { set: 'working', value: false },
            { set: 'done', value: true },
            { emit: { channel: 'tasks-changed' } },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    ...previewTriggers,
  ],
};

export const deskRequestInputSchema = z.toJSONSchema(
  z.object({
    stayId: z.string().optional().describe('The guest who asked. This is what makes the request reachable by a push, a link or the assistant.'),
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    title: z
      .string()
      .optional()
      .describe('What the guest asked for, in the fewest words that still say it: "Two extra pillows", "Breakfast at ten". This is the line whoever it is sent to reads on their own job list.'),
    detail: z
      .string()
      .optional()
      .describe('Anything the person doing it needs and cannot see — when it has to happen, which room, what the guest actually said. Written out, so nobody has to come back and ask.'),
    drafted: z.string().optional().describe('Set this to the same text as `title` when the words are yours, so the card says so.'),
    kind: z.string().optional().describe('Who does it: housekeeping, maintenance, or front office. Choose from what was asked for, not from who is free.'),
    assigneeId: z.string().optional().describe('Who to send it to — a staff id from the list on the card. Leave it out and it goes to the trade unassigned.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full surface.'),
  }),
);
