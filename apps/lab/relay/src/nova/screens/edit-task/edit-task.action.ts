import type { ActionDefinition } from '@niscorp/nova';
import { newTaskLayout } from '../new-task/new-task.layout';

// Edit a task. Pushed from the tasks screen's row ⋯ → Edit, which seeds the id +
// the form fields from the row (title + the RAW due date, so the date input
// round-trips). Reuses the new-task form layout — same form, populated. Confirm
// runs `task.update`, announces `tasks-changed` so every task list re-reads, then
// pops. (`priority` is a form-only field with no column; it's ignored on save.)
export const editTaskAction: ActionDefinition = {
  id: 'edit-task',
  data: { id: '', title: '', due: '', priority: '', deal_id: '', modalTitle: 'Edit task', confirmLabel: 'Save' },
  layout: newTaskLayout,
  endpoints: { save: { fn: 'task.update' } },
  triggers: [{ event: 'ui:click', ref: 'confirm', do: [{ call: 'save', onSuccess: [{ emit: { channel: 'tasks-changed' } }, { pop: true }] }] }],
};
