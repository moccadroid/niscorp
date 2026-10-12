import { z } from 'zod';
import type { Query } from '@niscorp/vex';
import type { CacheEntry } from './index';
import { dateText } from '@fable/lib/format.prism';

const listBody = {
  todo_id: { $get: { from: { $var: 'r' }, path: ['todo_id'] } },
  title: { $get: { from: { $var: 'r' }, path: ['title'] } },
  notes: { $get: { from: { $var: 'r' }, path: ['notes'] } },
  priority: { $get: { from: { $var: 'r' }, path: ['priority'] } },
  due_date: { $get: { from: { $var: 'r' }, path: ['due_date'] } },
  due_date_display: dateText({ $get: { from: { $var: 'r' }, path: ['due_date'] } }),
  done: { $get: { from: { $var: 'r' }, path: ['done'] } },
};

const listFields = [
  { field: 'todos.id', as: 'todo_id' },
  'todos.title',
  'todos.notes',
  'todos.priority',
  'todos.due_date',
  'todos.done',
];

// `overdue` is computed in the query, not the mapping: only the query sees
// `$context.today`.
const overdueCompute: NonNullable<Query['compute']> = {
  overdue: {
    case: {
      when: [{ condition: { lt: ['todos.due_date', { $context: 'today' }] }, then: true }],
      else: false,
    },
  },
};

export const todosOpen: CacheEntry = {
  fingerprint: 'todos/open',
  intent: 'List open todos ordered by due date, flagging overdue ones',
  shape: [{ todo_id: '', title: '', notes: '', priority: '', due_date: '', due_date_display: '', done: false, overdue: false }],
  dsl: {
    from: ['todos'],
    fields: listFields,
    compute: overdueCompute,
    filter: {
      and: [
        { eq: ['todos.done', false] },
        { ilike: ['todos.title', { $context: 'q' }] },
      ],
    },
    sort: [{ field: 'todos.due_date', dir: 'asc' }],
    limit: 100,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: { ...listBody, overdue: { $get: { from: { $var: 'r' }, path: ['overdue'] } } },
    },
  },
};

export const todosToday: CacheEntry = {
  fingerprint: 'todos/today',
  intent: 'List open todos due today or earlier (today plus overdue)',
  shape: [{ todo_id: '', title: '', notes: '', priority: '', due_date: '', due_date_display: '', done: false, overdue: false, today: true }],
  dsl: {
    from: ['todos'],
    fields: listFields,
    compute: overdueCompute,
    filter: {
      and: [
        { eq: ['todos.done', false] },
        { lte: ['todos.due_date', { $context: 'today' }] },
        { ilike: ['todos.title', { $context: 'q' }] },
      ],
    },
    sort: [{ field: 'todos.due_date', dir: 'asc' }],
    limit: 100,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        ...listBody,
        overdue: { $get: { from: { $var: 'r' }, path: ['overdue'] } },
        today: { $const: true },
      },
    },
  },
};

export const todosDone: CacheEntry = {
  fingerprint: 'todos/done',
  intent: 'List done todos, most recently completed first',
  shape: [{ todo_id: '', title: '', notes: '', priority: '', due_date: '', due_date_display: '', done: true, done_at_display: '' }],
  dsl: {
    from: ['todos'],
    fields: [...listFields, 'todos.done_at'],
    filter: {
      and: [
        { eq: ['todos.done', true] },
        { ilike: ['todos.title', { $context: 'q' }] },
      ],
    },
    sort: [{ field: 'todos.done_at', dir: 'desc' }],
    limit: 100,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: { ...listBody, done_at_display: dateText({ $get: { from: { $var: 'r' }, path: ['done_at'] } }) },
    },
  },
};

// Conditional sums over one scan, not four cross-joined COUNT(*) subqueries:
// Vex restarts parameter numbering inside each `from` subquery, so two
// subqueries that each use `$context.today` collide on `$1`.
export const todoStats: CacheEntry = {
  fingerprint: 'todos/stats',
  intent: 'Todo counts — open, due today, overdue, done',
  shape: { open: 0, due_today: 0, overdue: 0, done: 0 },
  dsl: {
    from: ['todos'],
    aggregate: {
      open: { sum: { case: { when: [{ condition: { eq: ['todos.done', false] }, then: 1 }], else: 0 } } },
      due_today: {
        sum: {
          case: {
            when: [{ condition: { and: [{ eq: ['todos.done', false] }, { eq: ['todos.due_date', { $context: 'today' }] }] }, then: 1 }],
            else: 0,
          },
        },
      },
      overdue: {
        sum: {
          case: {
            when: [{ condition: { and: [{ eq: ['todos.done', false] }, { lt: ['todos.due_date', { $context: 'today' }] }] }, then: 1 }],
            else: 0,
          },
        },
      },
      done: { sum: { case: { when: [{ condition: { eq: ['todos.done', true] }, then: 1 }], else: 0 } } },
    },
  },
  mapping: { $ref: '$.result' },
};

const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .describe('ISO date (YYYY-MM-DD), or null for no due date');

export const TodoSaveBody = z
  .object({
    todo_id: z.string().nullable().describe('Existing todo id to update, or null to create'),
    title: z.string().trim().min(1).describe('What needs doing'),
    notes: z.string().nullable().describe('Free-form detail, or null'),
    priority: z.enum(['low', 'medium', 'high']),
    due_date: dueDate,
  })
  .strict();
export type TodoSaveBody = z.infer<typeof TodoSaveBody>;

export const TodoSetDoneBody = z
  .object({
    todo_id: z.string().min(1),
    done: z.boolean().describe('The NEW state — true completes, false reopens'),
  })
  .strict();
export type TodoSetDoneBody = z.infer<typeof TodoSetDoneBody>;

export const TodoDeleteBody = z.object({ todo_id: z.string().min(1) }).strict();
export type TodoDeleteBody = z.infer<typeof TodoDeleteBody>;
