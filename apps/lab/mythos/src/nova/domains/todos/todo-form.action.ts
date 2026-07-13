import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { jsonSchemaOf } from '../../../lib/schema';
import { todoPayloadRequest } from './todo-form.prism';
import { todoFormLayout } from './todo-form.layout';

// One form action for the entity (working pattern: create + edit). Loaded
// bare it creates; loaded with the record's raw fields seeded it edits —
// the layout picks the save button (and endpoint) off `todo_id`.
const TodoFormInputSchema = z
  .object({
    todo_id: z.string().describe('Existing todo id. Present ⇒ the form edits; absent ⇒ it creates.'),
    title: z.string().describe('Seed title.'),
    notes: z.string().describe('Seed notes.'),
    due_date: z.string().describe('Seed due date as YYYY-MM-DD, or empty for someday.'),
  })
  .partial()
  .describe('Openable inputs of the todo form: seed the raw record fields to edit it.');

export const todoForm: ActionDefinition = {
  id: 'todo-form',
  name: 'Todo form',
  description: 'Create a todo, or edit one when seeded with its raw fields.',
  data: {
    todo_id: '',
    title: '',
    notes: '',
    due_date: '',
    saving: false,
    error: '',
  },
  input: jsonSchemaOf(TodoFormInputSchema),
  endpoints: {
    createTodo: {
      url: '/api/todos',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      request: todoPayloadRequest,
      errorTarget: 'lastError',
    },
    updateTodo: {
      url: '/api/todos/{{$.todo_id}}',
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      request: todoPayloadRequest,
      errorTarget: 'lastError',
    },
  },
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    {
      event: 'ui:click',
      ref: 'save-create',
      do: [
        { set: 'saving', value: true },
        { set: 'error', value: '' },
        {
          call: 'createTodo',
          onSuccess: [{ emit: { channel: 'todos-changed' } }, { pop: true }],
          onError: [
            { set: 'saving', value: false },
            { set: 'error', value: '{{@error.message}}' },
          ],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'save-update',
      do: [
        { set: 'saving', value: true },
        { set: 'error', value: '' },
        {
          call: 'updateTodo',
          onSuccess: [{ emit: { channel: 'todos-changed' } }, { pop: true }],
          onError: [
            { set: 'saving', value: false },
            { set: 'error', value: '{{@error.message}}' },
          ],
        },
      ],
    },
  ],
  layout: todoFormLayout,
};
