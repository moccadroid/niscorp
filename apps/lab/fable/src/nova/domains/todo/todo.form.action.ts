import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { todoFormLayout } from './todo.form.layout';
import { saveTodoPrism } from './todo.form.prism';
import { resultPrism } from '@fable/nova/shared/result.prism';

// ONE form action, create and edit. Loaded bare it creates; loaded with the
// record's raw fields seeded (id, title, notes, priority, due) it edits —
// the save endpoint's handler inserts or updates on the blank/non-blank id.
// Pushed onto the `modal` canvas `with: ['modal']` for the dialog chrome.
export const todoFormAction: ActionDefinition = {
  id: 'todo.form',
  data: {
    modalTitle: 'New todo',
    confirmLabel: 'Create',
    id: '',
    title: '',
    notes: '',
    priority: 'medium',
    due: '',
    saved: null,
  },
  input: z.toJSONSchema(
    z
      .object({
        modalTitle: z.string().optional().describe('Dialog title ("New todo" / "Edit todo")'),
        confirmLabel: z.string().optional().describe('Confirm button label ("Create" / "Save")'),
        id: z.string().optional().describe('Existing todo id — blank creates, non-blank edits'),
        title: z.string().optional().describe('What needs doing'),
        notes: z.string().nullable().optional().describe('Free-form detail'),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        due: z.string().optional().describe('Raw ISO due date (YYYY-MM-DD), or blank for none'),
      })
      .strict(),
  ),
  layout: todoFormLayout,
  endpoints: {
    save: { url: '/api/todos/save', method: 'POST', request: saveTodoPrism, response: resultPrism, target: 'saved' },
  },
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'confirm', do: [{ call: 'save', onSuccess: [{ emit: { channel: 'todos-changed' } }, { pop: true }] }] },
  ],
};
