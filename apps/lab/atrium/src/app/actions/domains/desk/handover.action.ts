import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { handoverLayout } from './handover.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { handoversPrism, handoverWritePrism } from './desk.prism';

// The end of the shift.
//
// This is the one place in the app where a SUMMARY is the right output, and
// saying that plainly matters because it is also the thing an assistant will
// reach for everywhere if you let it. A card that summarises a screen the person
// is already looking at is noise. A note addressed to somebody who was not here
// is the opposite: they have no other way to find out.
//
// So `body` is declared input and this is the surface the model should want.
// Everything it needs to write one is a query it can already run.
export const deskHandoverAction: ActionDefinition = {
  id: 'desk.handover',
  title: 'Handover',
  data: { propertyId: '', staffId: '', notes: [], shift: 'day', body: '', drafted: '', loading: true, working: false, saved: false, expanded: true },
  layout: previewable(
    crewCard('Handover', 'chat', { $if: '$.notes.length', $then: 'Last: {{$.notes.0.author_name}}, {{$.notes.0.created_display}}', $else: 'Nothing left yet this shift.' }),
    handoverLayout,
  ),
  endpoints: {
    load: { url: '/api/service/vex', method: 'POST', request: handoversPrism, target: 'notes' },
    save: { url: '/api/service/vex', method: 'POST', request: handoverWritePrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:click', ref: 'shift', do: [{ set: 'shift', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'body', do: [{ set: 'body', value: '@event.payload' }, { set: 'drafted', value: '' }] },
    {
      event: 'ui:click',
      ref: 'save',
      do: [
        { set: 'working', value: true },
        {
          call: 'save',
          onSuccess: [{ set: 'working', value: false }, { set: 'saved', value: true }, { set: 'body', value: '' }, { call: 'load' }],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    ...previewTriggers,
  ],
};

export const deskHandoverInputSchema = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    staffId: z.string().optional().describe('Who is leaving the note — seeded by the opener from the session.'),
    shift: z.enum(['day', 'evening', 'night']).optional().describe('Which shift is ending.'),
    body: z
      .string()
      .optional()
      .describe(
        'The handover, ALREADY WRITTEN, waiting to be read and left. Write it from what actually moved: faults still open with nobody on them, guests who are unhappy, anything promised to somebody, rooms out of service, and what walks in next. Short paragraphs, no headings, no list markup — the way a person writes a note to the colleague replacing them. This is the ONE surface where a summary is the point.',
      ),
    drafted: z.string().optional().describe('Set this to the same text as `body` when the words are yours, so the card says so.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the composed crew surface); true (default) the full note.'),
  }),
);
