import type { ActionDefinition } from '@niscorp/nova';
import { topbarLayout } from './topbar.layout';

export const topbarAction: ActionDefinition = {
  id: 'topbar',
  data: { title: 'Fable' },
  layout: topbarLayout,
  triggers: [
    { event: 'ui:click', ref: 'new', do: [{ push: { action: 'todo.form', canvas: 'modal', with: ['modal'] } }] },
  ],
};
