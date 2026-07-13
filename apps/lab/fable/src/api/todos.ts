import { z } from 'zod';
import type { Query } from '@niscorp/vex';
import type { CacheEntry } from './index';
import { dateText } from '@fable/lib/format.prism';

// ═══════════════════════════════════════════════════════════
// Reads — the prewarmed cache entries, each under its NAMED fingerprint (the
// identity the prisms replay). Three list scopes, three DISTINCT shapes: Open
// carries a computed `overdue` flag, Today adds a const `today` marker on top
// of it, Done swaps the flag for `done_at_display`. `due_date` is kept RAW
// alongside `due_date_display` so a row's ⋯ → Edit can seed the form's date
// input.
// ═══════════════════════════════════════════════════════════

// Fields shared by every list mapping — each body key reads the aliased row
// column; the display fields format on the way out of Vex.
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

// `overdue` is computed in the DSL (not the mapping) because only the query
// sees `$context.today` — the mapping runs over bare rows.
const overdueCompute: NonNullable<Query['compute']> = {
  overdue: {
    case: {
      when: [{ condition: { lt: ['todos.due_date', { $context: 'today' }] }, then: true }],
      else: false,
    },
  },
};

// Open todos, soonest due first (dateless last). Overdue rows are flagged.
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

// The Today scope: open todos due on or before today — today's plus the
// overdue backlog. The const `today` key labels the rows.
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

// Done todos, most recently completed first. `done_at_display` replaces the
// overdue flag — distinct shape, and the Done tab shows when it was finished.
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

// The stat row — four counts in ONE read, as conditional sums over a single
// scan (one aggregated row → an object shape; identity mapping returns it
// as-is). NOT four cross-joined COUNT(*) subqueries: Vex restarts parameter
// numbering inside each `from` subquery, so two subqueries that each use
// `$context.today` collide on `$1` — a platform bug to report, dodged here
// by keeping the query flat.
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

// ═══════════════════════════════════════════════════════════
// Writes — the endpoint body contracts (D4: plain handlers). Each body is
// parsed `.strict()` at the boundary by the handler in vex/http/writes.ts.
// `done_at` has no contract on purpose: the endpoint stamps it.
// ═══════════════════════════════════════════════════════════

const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .describe('ISO date (YYYY-MM-DD), or null for no due date');

// Create-or-edit: a null `todo_id` inserts (the DB mints the id), a non-null
// one updates.
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
