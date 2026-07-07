import type { ActionDefinition } from '@niscorp/nova';
import { taskFormLayout } from './task.form.layout';
import { upsertTaskPrism } from './task.form.prism';
import { resultPrism } from '@relay/nova/shared/result.prism';

// The task form — create AND edit in one action. The `save` endpoint is the
// `task.upsert` mutation, which desugars to insert (no `id`) or update (`id` set):
// a bare push creates, a deal's "Add task" seeds the insert-only `deal_id`, an
// edit push (with `id`) edits title+due without touching `deal_id`. Tasks have no
// single-record view, so on success it just announces `tasks-changed` (every task
// list re-reads) and pops. (`priority` is form-only — no column; the seam drops it.)
export const taskFormAction: ActionDefinition = {
  id: 'task.form',
  data: {
    modalTitle: 'New task',
    confirmLabel: 'Create',
    id: '', title: '', due: '', priority: '', deal_id: '',
  },
  layout: taskFormLayout,
  // One write — `task.upsert` desugars to insert (id empty) or update (id set);
  // `deal_id` is insert-only, so an edit never disturbs it.
  endpoints: { save: { url: '/api/tasks/vex', method: 'POST', request: upsertTaskPrism, response: resultPrism, target: 'saved' } },
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'confirm', do: [{ call: 'save', onSuccess: [{ emit: { channel: 'tasks-changed' } }, { pop: true }] }] },
  ],
};
