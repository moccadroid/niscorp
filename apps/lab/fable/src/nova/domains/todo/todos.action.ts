import type { ActionDefinition } from '@niscorp/nova';
import { todosLayout } from './todos.layout';
import { listTodosPrism, statsTodosPrism, setDoneTodoPrism, deleteTodoPrism } from './todos.prism';
import { resultPrism } from '@fable/nova/shared/result.prism';

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
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'tab', do: [{ set: 'scope', value: '@event.payload' }, { call: 'load' }] },
    {
      event: 'ui:click',
      ref: 'toggle',
      do: [
        { set: 'toggleId', value: '@event.payload.id' },
        { set: 'toggleDone', value: '@event.payload.done' },
        { call: 'setDone', onSuccess: [{ emit: { channel: 'todos-changed' } }] },
      ],
    },
    { message: 'todos-changed', do: [{ call: 'load' }, { call: 'loadStats' }] },
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
