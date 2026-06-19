import type { ActionDefinition } from '@niscorp/nova';
import { newTaskLayout } from './new-task.layout';

// "Create a task" — pushed `with: ['modal']` from the Tasks screen's `new`
// handler, or from a deal's "Add task" (which seeds `deal_id` via input so the
// task links to that deal). The data IS the form; `create` runs `task.create`,
// whose input prism maps it to columns (due → due_date, both due_date and the
// optional deal_id empty → null; priority dropped). On success we announce
// `tasks-changed` (lists + the deal modal re-read) and THEN pop.
export const newTaskAction: ActionDefinition = {
  id: 'new-task',
  data: { title: '', due: '', priority: '', deal_id: '', modalTitle: 'New task', confirmLabel: 'Create' },
  layout: newTaskLayout,
  endpoints: { create: { fn: 'task.create' } },
  triggers: [
    { event: 'ui:click', ref: 'confirm', do: [{ call: 'create', onSuccess: [{ emit: { channel: 'tasks-changed' } }, { pop: true }] }] },
  ],
};
