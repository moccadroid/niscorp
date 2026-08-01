import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { noteLayout } from './note.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { notesByStayPrism, noteAddPrism } from './desk.prism';

// A note on a stay that outlives the shift.
//
// The value compounds: what gets written here today is what the brief reads out
// on their next visit, which is how a hotel comes to feel like it remembers
// people. It is also the natural home for the thing a guest says in passing —
// "we are here for our tenth anniversary" arrives in a message thread and is
// lost the moment the thread scrolls, unless somebody puts it somewhere.
//
// Which is exactly what an assistant reading that thread should offer to do, and
// why `body` is declared input.
export const deskNoteAction: ActionDefinition = {
  id: 'desk.note',
  title: 'Notes',
  data: { stayId: '', propertyId: '', author: '', notes: [], kind: 'preference', body: '', drafted: '', loading: true, working: false, expanded: true },
  layout: previewable(
    crewCard('Notes', 'chat', { $if: '$.notes.length', $then: '{{$.notes.length}} on file — “{{$.notes.0.body}}”', $else: 'Nothing written down yet.' }),
    noteLayout,
  ),
  endpoints: {
    load: { url: '/api/service/vex', method: 'POST', request: notesByStayPrism, target: 'notes' },
    save: { url: '/api/service/vex', method: 'POST', request: noteAddPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:click', ref: 'kind', do: [{ set: 'kind', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'body', do: [{ set: 'body', value: '@event.payload' }, { set: 'drafted', value: '' }] },
    {
      event: 'ui:click',
      ref: 'save',
      do: [
        { set: 'working', value: true },
        {
          call: 'save',
          onSuccess: [{ set: 'working', value: false }, { set: 'body', value: '' }, { set: 'drafted', value: '' }, { call: 'load' }, { emit: { channel: 'notes-changed' } }],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    { message: 'notes-changed', do: [{ call: 'load' }] },
    ...previewTriggers,
  ],
};

export const deskNoteInputSchema = z.toJSONSchema(
  z.object({
    stayId: z.string().optional().describe('Whose notes these are.'),
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    author: z.string().optional().describe('Who is writing it — seeded by the opener from the session.'),
    kind: z.enum(['preference', 'note', 'watch']).optional().describe('preference: how the guest likes things. note: a fact about this visit. watch: something whoever deals with the guest next should be careful about.'),
    body: z
      .string()
      .optional()
      .describe(
        'The note, ALREADY WRITTEN, waiting to be saved. Write these when a guest tells you something in passing that the next shift would want to know — an anniversary, a preference, a sensitivity. One sentence, in the third person, as a colleague would write it. Nobody saves it but them.',
      ),
    drafted: z.string().optional().describe('Set this to the same text as `body` when the words are yours, so the card says so.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full surface.'),
  }),
);
