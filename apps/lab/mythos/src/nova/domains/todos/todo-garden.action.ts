import type { ActionDefinition } from '@niscorp/nova';
import { readEntries } from '../../../api/reads';
import { DEFAULT_STATS, readEndpoint } from '../../shared/endpoints';
import { todoGardenLayout } from './todo-garden.layout';

// "The Garden": the whole set as plots — sprout (open), wilt (overdue),
// bloom (done). Clicking a sprout completes the todo (with confetti via
// todo-bloomed); clicking a bloom replants it. The spark counter only ever
// increments, so each bloom replays the burst.
export const todoGarden: ActionDefinition = {
  id: 'todo-garden',
  name: 'The Garden',
  description: 'Every todo as a garden plot; click to complete or replant.',
  data: {
    garden: [],
    stats: DEFAULT_STATS,
    loading: true,
    toggleId: '',
    spark: 0,
  },
  endpoints: {
    loadGarden: readEndpoint(readEntries.gardenTodos.fingerprint, 'garden'),
    loadStats: readEndpoint(readEntries.todoStats.fingerprint, 'stats'),
    completeTodo: {
      url: '/api/todos/{{$.toggleId}}/done',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      request: { $const: { done: true } },
    },
    reopenTodo: {
      url: '/api/todos/{{$.toggleId}}/done',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      request: { $const: { done: false } },
    },
  },
  lifecycle: {
    mount: [
      { call: 'loadGarden', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'loadStats' },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'plot-sprout',
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
      ref: 'plot-bloom',
      do: [
        { set: 'toggleId', value: '{{@event.payload}}' },
        { call: 'reopenTodo', onSuccess: [{ emit: { channel: 'todos-changed' } }] },
      ],
    },
    { message: 'todos-changed', do: [{ call: 'loadGarden' }, { call: 'loadStats' }] },
    { message: 'todo-bloomed', do: [{ increment: 'spark' }] },
  ],
  layout: todoGardenLayout,
};
