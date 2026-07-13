import type { ActionDefinition } from '@niscorp/nova';
import { topbarLayout } from './topbar.layout';

// The topbar: the wordmark and the one global action — New todo, which opens
// the form in create mode on the modal canvas (with the dialog chrome).
export const topbarAction: ActionDefinition = {
  id: 'topbar',
  data: { title: 'Fable' },
  layout: topbarLayout,
  triggers: [
    { event: 'ui:click', ref: 'new', do: [{ push: { action: 'todo.form', canvas: 'modal', with: ['modal'] } }] },
  ],
};
