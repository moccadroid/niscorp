import type { ActionDefinition } from '@niscorp/nova';
import { tasksLayout } from './tasks.layout';

// The tasks screen — now a full management surface. `tasks.mine` is scoped by
// the `$.scope` tab (Open / Overdue / Done / All); search (`$.search`) and the table's
// reserved sort re-run it. Each row has an inline checkbox (complete/reopen via
// `task.setDone`) and a ⋯ menu (Edit seeds the form from the row; Delete confirms
// then removes). Every write announces `tasks-changed` so this list, the deal
// modal, the contact panel and the sidebar badge all re-read.
export const tasksAction: ActionDefinition = {
  id: 'tasks',
  title: 'Tasks',
  data: {
    search: '',
    scope: 'open',
    rows: [],
    loading: true,
    sortBy: 'tasks.due_date',
    sortDir: 'asc',
    toggleId: '',
    toggleDone: false,
    menuOpenId: '',
    pendingDeleteId: '',
    pendingDeleteLabel: '',
  },
  layout: tasksLayout,
  endpoints: {
    load: { fn: 'tasks.mine', target: 'rows' },
    setDone: { fn: 'task.setDone' },
    remove: { fn: 'task.delete' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    // Toolbar: search + scope tabs + sortable headers each re-run the list.
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'tab', do: [{ set: 'scope', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'sort', do: [{ set: 'sortBy', value: '@event.payload.sortBy' }, { set: 'sortDir', value: '@event.payload.sortDir' }, { call: 'load' }] },
    // Inline checkbox → persist the new done state. The check cell hands
    // { id, done }; on success announce the change so every list re-reads.
    { event: 'ui:click', ref: 'toggle', do: [{ set: 'toggleId', value: '@event.payload.id' }, { set: 'toggleDone', value: '@event.payload.done' }, { call: 'setDone', onSuccess: [{ emit: { channel: 'tasks-changed' } }] }] },
    // `new` (the topbar's + New) opens the task form in create mode.
    { message: 'new', do: [{ push: { action: 'task.form', canvas: 'modal', with: ['modal'] } }] },
    // A create/complete/edit/delete anywhere → re-read.
    { message: 'tasks-changed', do: [{ call: 'load' }] },
    // Row ⋯ menu. Items carry the whole row (the Table passes it). Edit opens the
    // form seeded from the row (title + raw due date); Delete confirms first.
    { event: 'ui:click', ref: 'menu-open', do: [{ set: 'menuOpenId', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'menu-close', do: [{ set: 'menuOpenId', value: '' }] },
    {
      event: 'ui:click',
      ref: 'row-edit',
      do: [
        { set: 'menuOpenId', value: '' },
        { push: { action: 'task.form', canvas: 'modal', with: ['modal'], input: { modalTitle: 'Edit task', confirmLabel: 'Save', id: '@event.payload.task_id', title: '@event.payload.title', due: '@event.payload.due_date' } } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'row-delete',
      do: [
        { set: 'menuOpenId', value: '' },
        { set: 'pendingDeleteId', value: '@event.payload.task_id' },
        { set: 'pendingDeleteLabel', value: '@event.payload.title' },
        { push: { action: 'confirm-delete', canvas: 'modal', with: ['panel'], input: { label: '@event.payload.title', message: 'This permanently deletes the task. This can’t be undone.' } } },
      ],
    },
    { message: 'confirm-delete', do: [{ call: 'remove', onSuccess: [{ emit: { channel: 'tasks-changed' } }, { set: 'pendingDeleteId', value: '' }] }] },
  ],
};
