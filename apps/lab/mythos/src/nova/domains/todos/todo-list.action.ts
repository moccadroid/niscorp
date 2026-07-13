import type { ActionDefinition } from '@niscorp/nova';
import { readEntries } from '../../../api/reads';
import { DEFAULT_STATS, readEndpoint } from '../../shared/endpoints';
import { todoListLayout } from './todo-list.layout';

// "The Patch": open todos. Checking a row completes it (and announces);
// ✎ opens the form seeded from the clicked row; ✕ opens the confirm
// overlay. Re-reads on every todos-changed, its own included.
export const todoList: ActionDefinition = {
  id: 'todo-list',
  name: 'The Patch',
  description: 'Open todos with complete/edit/delete row controls.',
  data: {
    todos: [],
    stats: DEFAULT_STATS,
    loading: true,
    toggleId: '',
  },
  endpoints: {
    loadTodos: readEndpoint(readEntries.todosOpen.fingerprint, 'todos'),
    loadStats: readEndpoint(readEntries.todoStats.fingerprint, 'stats'),
    completeTodo: {
      url: '/api/todos/{{$.toggleId}}/done',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      request: { $const: { done: true } },
    },
  },
  lifecycle: {
    mount: [
      { call: 'loadTodos', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'loadStats' },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'row-complete',
      do: [
        { set: 'toggleId', value: '{{@event.payload}}' },
        {
          call: 'completeTodo',
          onSuccess: [{ emit: { channel: 'todos-changed' } }, { emit: { channel: 'todo-bloomed' } }],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'row-edit',
      do: [
        {
          push: {
            action: 'todo-form',
            canvas: 'overlay',
            with: ['modal-frame'],
            input: {
              todo_id: '@event.payload.todo_id',
              title: '@event.payload.title',
              notes: '@event.payload.notes',
              due_date: '@event.payload.due_date',
            },
          },
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'row-delete',
      do: [
        {
          push: {
            action: 'todo-confirm-delete',
            canvas: 'overlay',
            with: ['modal-frame'],
            input: { todo_id: '@event.payload.todo_id', title: '@event.payload.title' },
          },
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'plant-first',
      do: [{ push: { action: 'todo-form', canvas: 'overlay', with: ['modal-frame'] } }],
    },
    { message: 'todos-changed', do: [{ call: 'loadTodos' }, { call: 'loadStats' }] },
  ],
  layout: todoListLayout,
};
