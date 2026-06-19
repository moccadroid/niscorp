import type { ActionDefinition } from '@niscorp/nova';
import { confirmDeleteLayout } from './confirm-delete.layout';

// Reusable "are you sure?" for destructive deletes. Pushed on the `modal` canvas
// with `input: { label, message }`. It owns no data about WHAT is being deleted
// beyond the display text — the list that opened it stashed the id and listens
// for `confirm-delete` to run the write. Cancel / ✕ just pop.
export const confirmDeleteAction: ActionDefinition = {
  id: 'confirm-delete',
  data: { label: 'this record', message: 'This can’t be undone.' },
  layout: confirmDeleteLayout,
  triggers: [
    { event: 'ui:click', ref: 'close', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    // Announce, then close. The opener's `confirm-delete` handler runs the delete.
    { event: 'ui:click', ref: 'confirm', do: [{ emit: { channel: 'confirm-delete' } }, { pop: true }] },
  ],
};
