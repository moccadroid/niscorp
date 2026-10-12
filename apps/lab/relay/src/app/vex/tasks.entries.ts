import type { CacheEntry } from './index';
import type { MutationEntry } from './index';
import { dateText } from '@relay/app/prisms/format.prism';

// Postgres orders booleans (false < true), so the `done` range selects open
// tasks, done tasks or both from one query.
export const tasksMine: CacheEntry = {
  fingerprint: 'tasks/mine',
  intent: 'List my tasks (open / done / all via a done range) ordered by due date',
  shape: [{ task_id: '', title: '', due_date: '', due_date_display: '', created_at: '', done: false, deal_id: '' }],
  dsl: {
    from: ['tasks'],
    fields: [{ field: 'tasks.id', as: 'task_id' }, 'tasks.title', 'tasks.due_date', 'tasks.created_at', 'tasks.done', 'tasks.deal_id'],
    filter: {
      and: [
        { eq: ['tasks.assignee_id', { $context: 'userId' }] },
        { gte: ['tasks.done', { $context: 'doneMin' }] },
        { lte: ['tasks.done', { $context: 'doneMax' }] },
        { ilike: ['tasks.title', { $context: 'q' }] },
      ],
    },
    sort: [{ field: 'tasks.due_date', dir: 'asc' }],
    limit: 100,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        task_id: { $get: { from: { $var: 'r' }, path: ['task_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        due_date: { $get: { from: { $var: 'r' }, path: ['due_date'] } },
        due_date_display: dateText({ $get: { from: { $var: 'r' }, path: ['due_date'] } }),
        created_at: dateText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
        done: { $get: { from: { $var: 'r' }, path: ['done'] } },
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
      },
    },
  },
};

export const tasksOverdue: CacheEntry = {
  fingerprint: 'tasks/overdue',
  intent: 'List my overdue open tasks (due before today)',
  shape: [{ task_id: '', title: '', due_date: '', due_date_display: '', created_at: '', done: false, deal_id: '', overdue: true }],
  dsl: {
    from: ['tasks'],
    fields: [{ field: 'tasks.id', as: 'task_id' }, 'tasks.title', 'tasks.due_date', 'tasks.created_at', 'tasks.done', 'tasks.deal_id'],
    filter: {
      and: [
        { eq: ['tasks.assignee_id', { $context: 'userId' }] },
        { eq: ['tasks.done', false] },
        { lt: ['tasks.due_date', { $context: 'today' }] },
        { ilike: ['tasks.title', { $context: 'q' }] },
      ],
    },
    sort: [{ field: 'tasks.due_date', dir: 'asc' }],
    limit: 100,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        task_id: { $get: { from: { $var: 'r' }, path: ['task_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        due_date: { $get: { from: { $var: 'r' }, path: ['due_date'] } },
        due_date_display: dateText({ $get: { from: { $var: 'r' }, path: ['due_date'] } }),
        created_at: dateText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
        done: { $get: { from: { $var: 'r' }, path: ['done'] } },
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
        overdue: { $const: true },
      },
    },
  },
};

export const tasksByContact: CacheEntry = {
  fingerprint: 'tasks/byContact',
  intent: "A contact's open tasks ordered by due date",
  shape: [{ task_id: '', title: '', due_date: '', done: false, deal_id: '' }],
  dsl: {
    from: ['tasks'],
    fields: [{ field: 'tasks.id', as: 'task_id' }, 'tasks.title', 'tasks.due_date', 'tasks.done', 'tasks.deal_id'],
    filter: { and: [{ eq: ['tasks.contact_id', { $context: 'contactId' }] }, { eq: ['tasks.done', false] }] },
    sort: [{ field: 'tasks.due_date', dir: 'asc' }],
    limit: 20,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        task_id: { $get: { from: { $var: 'r' }, path: ['task_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        due_date: dateText({ $get: { from: { $var: 'r' }, path: ['due_date'] } }),
        done: { $get: { from: { $var: 'r' }, path: ['done'] } },
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
      },
    },
  },
};

export const tasksByDeal: CacheEntry = {
  fingerprint: 'tasks/byDeal',
  intent: "A deal's tasks ordered by due date",
  shape: [{ task_id: '', title: '', due_date: '', done: false }],
  dsl: {
    from: ['tasks'],
    fields: [{ field: 'tasks.id', as: 'task_id' }, 'tasks.title', 'tasks.due_date', 'tasks.done'],
    filter: { eq: ['tasks.deal_id', { $context: 'id' }] },
    sort: [{ field: 'tasks.due_date', dir: 'asc' }],
    limit: 20,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        task_id: { $get: { from: { $var: 'r' }, path: ['task_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        due_date: dateText({ $get: { from: { $var: 'r' }, path: ['due_date'] } }),
        done: { $get: { from: { $var: 'r' }, path: ['done'] } },
      },
    },
  },
};

export const tasksOpenCount: CacheEntry = {
  fingerprint: 'tasks/openCount',
  intent: 'Count of open tasks',
  shape: { done: false, count: 0 },
  dsl: {
    from: ['tasks'],
    fields: ['tasks.done'],
    aggregate: { count: { count: '*' } },
    filter: { eq: ['tasks.done', false] },
    groupBy: ['tasks.done'],
  },
  mapping: { $ref: '$.result' },
};

export const taskUpsert: MutationEntry = {
  fingerprint: 'tasks/upsert',
  intent: 'Create a task, or edit one by id (a task keeps its deal on edit)',
  mutation: {
    op: 'upsert',
    table: 'tasks',
    key: 'id',
    columns: {
      title: { $context: 'title' },
      due_date: { $context: 'due_date' },
    },
    insert: {
      deal_id: { $context: 'deal_id' },
    },
  },
};

export const taskSetDone: MutationEntry = {
  fingerprint: 'tasks/setDone',
  intent: "Flip a task's done flag",
  mutation: {
    op: 'update',
    table: 'tasks',
    set: { done: { $context: 'done' } },
    where: { eq: ['tasks.id', { $context: 'id' }] },
  },
};

export const taskDelete: MutationEntry = {
  fingerprint: 'tasks/delete',
  intent: 'Delete a task by id',
  mutation: {
    op: 'delete',
    table: 'tasks',
    where: { eq: ['tasks.id', { $context: 'id' }] },
  },
};
