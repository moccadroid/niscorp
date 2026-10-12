import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { taskFormLayout } from './task.form.layout';
import { upsertTaskPrism } from './task.form.prism';

export const taskFormAction: ActionDefinition = {
  id: 'tasks.form',
  data: {
    modalTitle: 'New task',
    confirmLabel: 'Create',
    id: '', title: '', due: '', priority: '', deal_id: '',
  },
  layout: taskFormLayout,
  endpoints: { save: { url: '/api/tasks/vex', method: 'POST', request: upsertTaskPrism, target: 'saved' } },
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'confirm', do: [{ call: 'save', onSuccess: [{ emit: { channel: 'tasks-changed' } }, { pop: true }] }] },
  ],
};

export const taskFormInputSchema = z.toJSONSchema(
  z.object({
    title: z.string().optional(),
    due: z.string().optional().describe('ISO date'),
    deal_id: z.string().optional().describe('deal id (insert-only — links the task to a deal)'),
    id: z.string().optional().describe('task id when editing'),
    modalTitle: z.string().optional().describe('modal heading, e.g. "Edit task"'),
    confirmLabel: z.string().optional().describe('confirm button label, e.g. "Save"'),
  }),
  { target: 'draft-7' },
) as Record<string, unknown>;
