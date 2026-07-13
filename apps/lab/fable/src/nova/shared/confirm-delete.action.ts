import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { confirmDeleteLayout } from './confirm-delete.layout';

// Reusable "are you sure?" for destructive deletes. Pushed onto the `modal`
// canvas `with: ['modal']` (which supplies the card chrome and the ✕) and
// `input: { label }`. It owns no data about WHAT is being deleted beyond the
// display text — the list that opened it stashed the id and listens for
// `confirm-delete` to run the write. Cancel just pops.
export const confirmDeleteAction: ActionDefinition = {
  id: 'confirm-delete',
  data: { modalTitle: 'Delete?', label: 'this record' },
  input: z.toJSONSchema(
    z
      .object({
        modalTitle: z.string().optional().describe('The dialog title, e.g. "Delete todo?"'),
        label: z.string().optional().describe('Display name of the record being deleted'),
      })
      .strict(),
  ),
  layout: confirmDeleteLayout,
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    // Announce, then close. The opener's `confirm-delete` handler runs the delete.
    { event: 'ui:click', ref: 'confirm', do: [{ emit: { channel: 'confirm-delete' } }, { pop: true }] },
  ],
};
