import type { ActionDefinition } from '@niscorp/nova';
import { confirmDeleteLayout } from './confirm-delete.layout';

export const confirmDeleteAction: ActionDefinition = {
  id: 'confirm-delete',
  data: { label: 'this record', message: 'This can’t be undone.', panelSize: 'narrow' },
  layout: confirmDeleteLayout,
  triggers: [
    { event: 'ui:click', ref: 'close', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'confirm', do: [{ emit: { channel: 'confirm-delete' } }, { pop: true }] },
  ],
};
