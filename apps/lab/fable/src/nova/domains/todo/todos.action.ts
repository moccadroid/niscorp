import type { ActionDefinition } from '@niscorp/nova';
import { todosLayout } from './todos.layout';
import { listTodosPrism, statsTodosPrism, setDoneTodoPrism, deleteTodoPrism } from './todos.prism';
import { resultPrism } from '@fable/nova/shared/result.prism';

// The one list surface. `$.scope` (Open / Today / Done) picks which prewarmed
// read serves the table; search re-runs it in place. Each row has an inline
// checkbox (complete/reopen) and a ⋯ menu (Edit seeds the form from the row;
// Delete confirms then removes). Every write announces `todos-changed`; this
// action listens and re-reads both the rows and the stat row.
export const todosAction: ActionDefinition = {
  id: 'todos',
  title: 'Todos',
  data: {
    search: '',
    scope: 'open',
    rows: [],
    stats: { open: 0, due_today: 0, overdue: 0, done: 0 },
    loading: true,
    toggleId: '',
    toggleDone: false,
    menuOpenId: '',
    pendingDeleteId: '',
  },
  layout: todosLayout,
  endpoints: {
    load:      { url: '/api/todos/vex', method: 'POST', request: listTodosPrism,  response: resultPrism, target: 'rows' },
    loadStats: { url: '/api/todos/vex', method: 'POST', request: statsTodosPrism, response: resultPrism, target: 'stats' },
    setDone:   { url: '/api/todos/set-done',      method: 'POST', request: setDoneTodoPrism },
    remove:    { url: '/api/todos/delete',        method: 'POST', request: deleteTodoPrism },
  },
  lifecycle: {
    mount: [
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'loadStats' },
    ],
  },
  triggers: [
    // Toolbar: search + scope tabs each re-run the list.
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'tab', do: [{ set: 'scope', value: '@event.payload' }, { call: 'load' }] },
    // Inline checkbox → persist the new done state. The check cell hands
    // { id, done }; on success announce the change so every reader re-reads.
    {
      event: 'ui:click',
      ref: 'toggle',
      do: [
        { set: 'toggleId', value: '@event.payload.id' },
        { set: 'toggleDone', value: '@event.payload.done' },
        { call: 'setDone', onSuccess: [{ emit: { channel: 'todos-changed' } }] },
      ],
    },
    // A create/complete/edit/delete anywhere → re-read rows AND stats.
    { message: 'todos-changed', do: [{ call: 'load' }, { call: 'loadStats' }] },
    // Row ⋯ menu. Items carry the whole row (the Table passes it). Edit opens
    // the form seeded from the row (raw values, so it round-trips); Delete
    // stashes the id and confirms first.
    { event: 'ui:click', ref: 'menu-open', do: [{ set: 'menuOpenId', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'menu-close', do: [{ set: 'menuOpenId', value: '' }] },
    {
      event: 'ui:click',
      ref: 'row-edit',
      do: [
        { set: 'menuOpenId', value: '' },
        {
          push: {
            action: 'todo.form',
            canvas: 'modal',
            with: ['modal'],
            input: {
              modalTitle: 'Edit todo',
              confirmLabel: 'Save',
              id: '@event.payload.todo_id',
              title: '@event.payload.title',
              notes: '@event.payload.notes',
              priority: '@event.payload.priority',
              due: '@event.payload.due_date',
            },
          },
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'row-delete',
      do: [
        { set: 'menuOpenId', value: '' },
        { set: 'pendingDeleteId', value: '@event.payload.todo_id' },
        {
          push: {
            action: 'confirm-delete',
            canvas: 'modal',
            with: ['modal'],
            input: { modalTitle: 'Delete todo?', label: '@event.payload.title' },
          },
        },
      ],
    },
    { message: 'confirm-delete', do: [{ call: 'remove', onSuccess: [{ emit: { channel: 'todos-changed' } }, { set: 'pendingDeleteId', value: '' }] }] },
  ],
};
