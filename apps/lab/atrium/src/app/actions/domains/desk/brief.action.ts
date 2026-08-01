import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { briefLayout } from './brief.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { deskStayPrism, guestByStayPrism, visitCountPrism, folioTotalPrism, guestIssuesPrism, notesByStayPrism, transfersByStayPrism, goodwillByStayPrism } from './desk.prism';

// The one card the composition cannot produce.
//
// Opening a guest already places every stay-scoped surface the hotel offers, and
// that is right — a clerk's screen must not depend on model judgement. But every
// one of those cards answers "what can I DO for this person", and none of them
// answers "who is this", which is the question a clerk actually has in the two
// seconds before they speak.
//
// Seven reads, none of them new: the stay, the guest, how many times they have
// been here, what they have spent, what is broken, what the desk has written
// down, and what is already arranged. Assembling them is the whole feature.
//
// `reading` is the assistant's single line, and it is DECLARED INPUT rather than
// anything the card fetches — so the surface is complete and true with the model
// switched off, and better with it on. That is the shape every AI-adjacent
// surface in this app takes.
export const deskBriefAction: ActionDefinition = {
  id: 'desk.brief',
  title: 'Guest profile',
  data: { stayId: '', propertyId: '', stay: {}, guest: {}, visits: {}, total: {}, issues: [], notes: [], transfers: [], given: [], reading: '', loading: true, expanded: true },
  layout: previewable(
    crewCard('Guest profile', 'sparkle', {
      $if: '$.visits.count',
      $then: '{{$.guest.name}} · {{$.visits.count}} stays before · {{$.total.total_display}} on the bill',
      $else: '{{$.guest.name}} · first stay · {{$.total.total_display}} on the bill',
    }),
    briefLayout,
  ),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: deskStayPrism, target: 'stay' },
    // The guest first, because the visit count hangs off the PERSON and this
    // surface was handed a reservation.
    loadGuest: { url: '/api/stay/vex', method: 'POST', request: guestByStayPrism, target: 'guest' },
    loadVisits: { url: '/api/stay/vex', method: 'POST', request: visitCountPrism, target: 'visits' },
    loadTotal: { url: '/api/stay/vex', method: 'POST', request: folioTotalPrism, target: 'total' },
    loadIssues: { url: '/api/service/vex', method: 'POST', request: guestIssuesPrism, target: 'issues' },
    loadNotes: { url: '/api/service/vex', method: 'POST', request: notesByStayPrism, target: 'notes' },
    loadTransfers: { url: '/api/stay/vex', method: 'POST', request: transfersByStayPrism, target: 'transfers' },
    loadGiven: { url: '/api/stay/vex', method: 'POST', request: goodwillByStayPrism, target: 'given' },
  },
  lifecycle: {
    mount: [
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'loadGuest', onSuccess: [{ call: 'loadVisits' }] },
      { call: 'loadTotal' },
      { call: 'loadIssues' },
      { call: 'loadNotes' },
      { call: 'loadTransfers' },
      { call: 'loadGiven' },
    ],
  },
  triggers: [
    { message: 'stay-changed', do: [{ call: 'load' }] },
    { message: 'issues-changed', do: [{ call: 'loadIssues' }] },
    { message: 'notes-changed', do: [{ call: 'loadNotes' }] },
    { message: 'folio-changed', do: [{ call: 'loadTotal' }, { call: 'loadGiven' }] },
    { message: 'transfers-changed', do: [{ call: 'loadTransfers' }] },
    ...previewTriggers,
  ],
};

export const deskBriefInputSchema = z.toJSONSchema(
  z.object({
    stayId: z.string().optional().describe('Whose brief to read.'),
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    reading: z
      .string()
      .optional()
      .describe(
        'ONE short sentence: what you make of everything on this card that a clerk would not see at a glance. A pattern across stays, a note that changes how to greet them, a fault that has happened before. It is shown marked as yours. Leave it out when the figures speak for themselves — a restatement of what is already on screen is worse than silence.',
      ),
    expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full brief.'),
  }),
);
