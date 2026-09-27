import type { ActionDefinition } from '@niscorp/nova';
import { slideNotes } from '@lyceum/app/vex/deck.entries';
import { notesLayout } from './notes.layout';

// The speaker's notes for the slide on screen, beside its tool. A reactive
// read: the deck moving is a write to a table it reads, so the notes change
// with the slide and nothing tells them to.
export const notesAction: ActionDefinition = {
  id: 'speaker.notes',
  title: 'Notes',
  data: { notes: [] },
  layout: notesLayout,
  endpoints: {
    notes: { url: '/api/vex', method: 'POST', request: { fingerprint: slideNotes.fingerprint, context: {} }, target: 'notes' },
  },
  lifecycle: { mount: [{ call: 'notes' }] },
  triggers: [],
};
