import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { confirmDeleteLayout } from './confirm-delete.layout';

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
    { event: 'ui:click', ref: 'confirm', do: [{ emit: { channel: 'confirm-delete' } }, { pop: true }] },
  ],
};
