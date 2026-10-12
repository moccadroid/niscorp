import type { ActionDefinition } from '@niscorp/nova';
import { slideNotes } from '@lyceum/app/vex/deck.entries';
import { notesLayout } from './notes.layout';

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
