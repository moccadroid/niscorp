import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { tasksLayout } from './tasks.layout';
import { listTasksPrism, setDoneTaskPrism, deleteTaskPrism } from './tasks.prism';

export const tasksAction: ActionDefinition = {
  id: 'tasks.manage',
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
    load:    { url: '/api/tasks/vex', method: 'POST', request: listTasksPrism, target: 'rows' },
    setDone: { url: '/api/tasks/vex',           method: 'POST', request: setDoneTaskPrism },
    remove:  { url: '/api/tasks/vex',           method: 'POST', request: deleteTaskPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'tab', do: [{ set: 'scope', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'sort', do: [{ set: 'sortBy', value: '@event.payload.sortBy' }, { set: 'sortDir', value: '@event.payload.sortDir' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'toggle', do: [{ set: 'toggleId', value: '@event.payload.id' }, { set: 'toggleDone', value: '@event.payload.done' }, { call: 'setDone', onSuccess: [{ emit: { channel: 'tasks-changed' } }] }] },
    { message: 'new', do: [{ push: { action: 'tasks.form', canvas: 'modal', with: ['modal'] } }] },
    { message: 'tasks-changed', do: [{ call: 'load' }] },
    { event: 'ui:click', ref: 'menu-open', do: [{ set: 'menuOpenId', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'menu-close', do: [{ set: 'menuOpenId', value: '' }] },
    {
      event: 'ui:click',
      ref: 'row-edit',
      do: [
        { set: 'menuOpenId', value: '' },
        { push: { action: 'tasks.form', canvas: 'modal', with: ['modal'], input: { modalTitle: 'Edit task', confirmLabel: 'Save', id: '@event.payload.task_id', title: '@event.payload.title', due: '@event.payload.due_date' } } },
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

export const tasksInputSchema = z.toJSONSchema(
  z.object({
    scope: z.enum(['open', 'overdue', 'done', 'all']).optional(),
    search: z.string().optional(),
    sortBy: z.string().optional().describe("a column: 'tasks.due_date', 'tasks.title', 'tasks.created_at'"),
    sortDir: z.enum(['asc', 'desc']).optional(),
  }),
);
