import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { jsonSchemaOf } from '../../../lib/schema';
import { todoConfirmDeleteLayout } from './todo-confirm-delete.layout';

const ConfirmDeleteInputSchema = z
  .object({
    todo_id: z.string().describe('Id of the todo to delete.'),
    title: z.string().describe('Title shown in the confirmation copy.'),
  })
  .partial()
  .describe('Openable inputs of the delete confirmation.');

export const todoConfirmDelete: ActionDefinition = {
  id: 'todo-confirm-delete',
  name: 'Uproot?',
  description: 'Delete confirmation for a todo.',
  data: { todo_id: '', title: '', error: '' },
  input: jsonSchemaOf(ConfirmDeleteInputSchema),
  endpoints: {
    deleteTodo: {
      url: '/api/todos/{{$.todo_id}}',
      method: 'DELETE',
      errorTarget: 'lastError',
    },
  },
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    {
      event: 'ui:click',
      ref: 'confirm-delete',
      do: [
        {
          call: 'deleteTodo',
          onSuccess: [{ emit: { channel: 'todos-changed' } }, { pop: true }],
          onError: [{ set: 'error', value: '{{@error.message}}' }],
        },
      ],
    },
  ],
  layout: todoConfirmDeleteLayout,
};
