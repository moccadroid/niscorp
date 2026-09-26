import type { ActionDefinition } from '@niscorp/nova';
import { slideNotes } from '@lyceum/app/vex/deck.entries';

// The speaker's notes for the slide on screen, beside its tool. A reactive
// read: the deck moving is a write to a table it reads, so the notes change
// with the slide and nothing tells them to.
export const notesAction: ActionDefinition = {
  id: 'speaker.notes',
  title: 'Notes',
  data: { notes: [] },
  layout: {
    component: 'Sheet',
    props: { size: 'fill', areas: ['kick', 'notes'], rows: ['auto', 1] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'highlight' }, children: [{ component: 'Label', children: 'Notes' }] },
      {
        component: 'Cell',
        props: { area: 'notes', pad: 'none', scroll: 'y' },
        children: [{ component: 'Rows', props: { rows: '$.notes', rowKey: 'position', empty: 'No notes for this slide.', columns: [{ label: '', key: 'note', w: 1 }] } }],
      },
    ],
  },
  endpoints: {
    notes: { url: '/api/vex', method: 'POST', request: { fingerprint: slideNotes.fingerprint, context: {} }, target: 'notes' },
  },
  lifecycle: { mount: [{ call: 'notes' }] },
  triggers: [],
};
