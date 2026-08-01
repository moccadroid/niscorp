import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { escalateLayout } from './escalate.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { staffPrism, escalatePrism } from './desk.prism';

// "This is above my pay grade" — the gesture every front desk makes several
// times a shift and no software ever has a button for.
//
// Pushed rather than composed: it belongs to a specific thing that has gone
// wrong, so it arrives carrying that thing's ids. The assistant's contribution
// is `detail`, and it is the contribution that matters — a duty manager who has
// to come back and ask what happened has not been handed anything, and writing
// the whole story from a thread, an issue and a stay is precisely the work a
// model can do in the second it takes a clerk to reach for the phone.
export const deskEscalateAction: ActionDefinition = {
  id: 'desk.escalate',
  title: 'Escalate',
  data: { propertyId: '', stayId: '', issueId: '', roomId: '', staff: [], assigneeId: '', assigneeName: '', title: '', detail: '', drafted: '', working: false, done: false, expanded: true },
  layout: previewable(crewCard('Escalate', 'alert', 'Hand this to the duty manager, with the reason.'), escalateLayout),
  endpoints: {
    loadStaff: { url: '/api/service/vex', method: 'POST', request: staffPrism, target: 'staff' },
    hand: { url: '/api/service/vex', method: 'POST', request: escalatePrism },
  },
  lifecycle: { mount: [{ call: 'loadStaff' }] },
  triggers: [
    { event: 'ui:click', ref: 'pick-person', do: [{ set: 'assigneeId', value: '@event.payload.staff_id' }, { set: 'assigneeName', value: '@event.payload.name' }] },
    { event: 'ui:model', ref: 'title', do: [{ set: 'title', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'detail', do: [{ set: 'detail', value: '@event.payload' }, { set: 'drafted', value: '' }] },
    {
      event: 'ui:click',
      ref: 'hand',
      do: [
        { set: 'working', value: true },
        {
          call: 'hand',
          onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { emit: { channel: 'tasks-changed' } }],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    ...previewTriggers,
  ],
};

export const deskEscalateInputSchema = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    stayId: z.string().optional().describe('The stay it is about, if it is about one.'),
    issueId: z.string().optional().describe('The fault it is about, if it is about one.'),
    roomId: z.string().optional().describe('The room it is about, if it is about one.'),
    assigneeId: z.string().optional().describe('Who to hand it to — a staff id from the list on the card.'),
    assigneeName: z.string().optional().describe('Their name, for the confirmation line.'),
    title: z.string().optional().describe('One line naming the thing, as it should read on the duty manager’s list: "Room 412 — third fault, guest asking for a manager".'),
    detail: z
      .string()
      .optional()
      .describe(
        'The whole story, ALREADY WRITTEN, so the person taking it does not have to come back and ask. What happened, what has been tried, what the guest has been told, and what you think should happen. This is the field worth your effort.',
      ),
    drafted: z.string().optional().describe('Set this to the same text as `detail` when the words are yours, so the card says so.'),
    expanded: z.boolean().optional().describe('false renders the one-line card; true (default) the full surface.'),
  }),
);
