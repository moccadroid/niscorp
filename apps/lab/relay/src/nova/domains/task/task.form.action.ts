import type { ActionDefinition } from '@niscorp/nova';
import { taskFormLayout } from './task.form.layout';

// The task form — create AND edit in one action (Approach B: `$.saveFn` picks the
// write). Bare push is CREATE (`saveFn` defaults to `task.create`); a deal's "Add
// task" seeds `deal_id`; an edit push overrides `saveFn:'task.update'` + the `id`
// and fields. Tasks have no single-record view, so on success it just announces
// `tasks-changed` (every task list re-reads) and pops. (`priority` is form-only —
// no column; the write seam drops it.)
export const taskFormAction: ActionDefinition = {
  id: 'task.form',
  data: {
    saveFn: 'task.create',
    modalTitle: 'New task',
    confirmLabel: 'Create',
    id: '', title: '', due: '', priority: '', deal_id: '',
  },
  layout: taskFormLayout,
  endpoints: { save: { fn: '{{$.saveFn}}', target: 'saved' } },
  triggers: [
    { event: 'ui:click', ref: 'confirm', do: [{ call: 'save', onSuccess: [{ emit: { channel: 'tasks-changed' } }, { pop: true }] }] },
  ],
};
