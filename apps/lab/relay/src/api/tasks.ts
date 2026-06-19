import type { CacheEntry } from './index';
import type { Mutation } from '@relay/vex/mutations';
import { dateText } from '@relay/lib/format.prism';

// My tasks, scoped by the toolbar tab. ONE shape / ONE cached plan serves Open,
// Done and All via a `done` RANGE in context: PG orders booleans (false < true),
// so `done >= doneMin AND done <= doneMax` collapses to false-only (Open),
// true-only (Done) or both (All) depending on the bounds the prism supplies. No
// due constraint, so tasks without a due date still show. `due_date` is kept RAW
// (so a row's ⋯ → Edit seeds the date input) alongside `due_date_display`.
export const tasksMine: CacheEntry = {
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

// My OVERDUE tasks — open and past their due date (vs the injected `today`). Its
// own read (the due cutoff can't be a no-op in `tasksMine`); the const `overdue`
// key both flags the rows and keeps the shape distinct in the cache.
export const tasksOverdue: CacheEntry = {
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

// A contact's open tasks, earliest due first. Shape carries `deal_id` so it
// stays distinct from `tasksByDeal` in the shape-keyed cache.
export const tasksByContact: CacheEntry = {
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

// A deal's tasks (open + done), earliest due first.
export const tasksByDeal: CacheEntry = {
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

// Count of open tasks (a dashboard KPI) — one aggregated row → an object. The
// row already matches the shape, so the mapping is identity over that row.
export const tasksOpenCount: CacheEntry = {
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

// Create a task. `done` defaults false, `id`/`created_at` default in the DB. The
// input prism supplies `due_date` already coerced (empty → null). `assignee_id`
// is NOT here — the engine stamps identity from the scope policy, never the DSL.
export const taskCreate: Mutation = {
  op: 'insert',
  table: 'tasks',
  values: {
    title: { $context: 'title' },
    due_date: { $context: 'due_date' },
    deal_id: { $context: 'deal_id' },
  },
};

// Flip a task's done flag — the inline checkbox on every task list. `done` is the
// new value (true on the Open/overdue lists, false to reopen on the Done list).
export const taskSetDone: Mutation = {
  op: 'update',
  table: 'tasks',
  set: { done: { $context: 'done' } },
  where: { eq: ['tasks.id', { $context: 'id' }] },
};

// Edit a task (the row ⋯ → Edit seeds the form from the row). Title + due date;
// the input prism coerces an empty due → null. `assignee_id` is left as-is.
export const taskUpdate: Mutation = {
  op: 'update',
  table: 'tasks',
  set: {
    title: { $context: 'title' },
    due_date: { $context: 'due_date' },
  },
  where: { eq: ['tasks.id', { $context: 'id' }] },
};

// Delete a task by id (the row ⋯ → Delete, behind the shared confirm).
export const taskDelete: Mutation = {
  op: 'delete',
  table: 'tasks',
  where: { eq: ['tasks.id', { $context: 'id' }] },
};
