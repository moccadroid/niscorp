import type { Filter, OkCacheEntry } from '@niscorp/vex';
import { row } from '../lib/prism';

// ───────────────────────────────────────────────────────────
// Every read the app depends on, authored as a Vex cache entry
// (prewarmed at boot by src/vex/prewarm.ts — see AGENTS.md
// "Using Vex"). The FINGERPRINT is the cache key — the name the
// endpoints replay; id fields follow `<entity>_id`, and the
// mapping owns the result envelope (it runs over `{ result: rows }`
// for array shapes, `{ result: firstRow }` for object shapes).
//
// `$context.today` is the app's pinned reference date — stamped
// server-side by the /api/query handler, never the wall clock.
// ───────────────────────────────────────────────────────────

export type ReadEntry = Pick<OkCacheEntry, 'shape' | 'dsl'> & {
  fingerprint: string;
  intent: string;
  mapping?: unknown;
};

export const SHAPES = {
  todosOpen: [{ todo_id: '', title: '', notes: '', bloom: '', due_date: '', due_display: '', overdue: false }],
  garden: [{ todo_id: '', title: '', bloom: '', stage: '', is_bloom: false, when_display: '' }],
  stats: { open_count: 0, overdue_count: 0, done_today: 0, mood: '', mood_label: '' },
  doneDays: [{ done_on: '' }],
};

const OVERDUE_CONDS: Filter[] = [
  { isNotNull: 'todos.due_date' },
  { lt: ['todos.due_date', { $context: 'today' }] },
];
const OVERDUE: Filter = { and: OVERDUE_CONDS };

// SUM(CASE WHEN <cond> THEN 1 ELSE 0 END) — flat aggregates on one source,
// never parameterized subqueries (their param numbering collides).
const countWhere = (condition: Filter) => ({
  sum: { case: { when: [{ condition, then: 1 }], else: 0 } },
});

const todosOpen: ReadEntry = {
  fingerprint: 'todos/open',
  intent: 'List open todos with an overdue flag, soonest due first',
  shape: SHAPES.todosOpen,
  dsl: {
    from: ['todos'],
    fields: [
      { field: 'todos.id', as: 'todo_id' },
      'todos.title',
      'todos.notes',
      'todos.bloom',
      'todos.due_date',
    ],
    compute: {
      overdue: { case: { when: [{ condition: OVERDUE, then: true }], else: false } },
    },
    filter: { eq: ['todos.done', false] },
    sort: [
      { field: 'todos.due_date', dir: 'asc' },
      { field: 'todos.created_at', dir: 'asc' },
    ],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'row',
      body: {
        todo_id: row('todo_id'),
        title: row('title'),
        notes: row('notes'),
        bloom: row('bloom'),
        due_date: { $coalesce: [row('due_date'), { $const: '' }] },
        due_display: {
          $case: {
            branches: [{ when: { $empty: row('due_date') }, then: { $const: 'someday' } }],
            else: { $date: { value: row('due_date'), format: 'MMM D' } },
          },
        },
        overdue: row('overdue'),
      },
    },
  },
};

const gardenTodos: ReadEntry = {
  fingerprint: 'todos/garden',
  intent: 'Every todo as a garden plot with its stage: bloom when done, wilt when overdue, sprout otherwise',
  shape: SHAPES.garden,
  dsl: {
    from: ['todos'],
    fields: [
      { field: 'todos.id', as: 'todo_id' },
      'todos.title',
      'todos.bloom',
      'todos.due_date',
      'todos.done_on',
    ],
    compute: {
      stage: {
        case: {
          when: [
            { condition: { eq: ['todos.done', true] }, then: 'bloom' },
            { condition: OVERDUE, then: 'wilt' },
          ],
          else: 'sprout',
        },
      },
    },
    sort: [{ field: 'todos.created_at', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'row',
      body: {
        todo_id: row('todo_id'),
        title: row('title'),
        bloom: row('bloom'),
        stage: row('stage'),
        // Layout bindings have no string equality; the boolean is derived here.
        is_bloom: { $eq: [row('stage'), { $const: 'bloom' }] },
        when_display: {
          $case: {
            branches: [
              {
                when: { $eq: [row('stage'), { $const: 'bloom' }] },
                then: { $join: { parts: [{ $const: 'bloomed ' }, { $date: { value: row('done_on'), format: 'MMM D' } }] } },
              },
              { when: { $empty: row('due_date') }, then: { $const: 'someday' } },
              {
                when: { $eq: [row('stage'), { $const: 'wilt' }] },
                then: { $join: { parts: [{ $const: 'thirsty since ' }, { $date: { value: row('due_date'), format: 'MMM D' } }] } },
              },
            ],
            else: { $join: { parts: [{ $const: 'due ' }, { $date: { value: row('due_date'), format: 'MMM D' } }] } },
          },
        },
      },
    },
  },
};

// Mood thresholds: 3 overdue = blush (overloaded), 7 open = peach (buzzing),
// 3 open = butter (cozy), else mint (calm). Derived here — never in components.
const MOOD_BRANCHES = (value: (token: string) => unknown) => ({
  $case: {
    branches: [
      { when: { $gte: [{ $var: 'over' }, { $const: 3 }] }, then: value('blush') },
      { when: { $gte: [{ $var: 'open' }, { $const: 7 }] }, then: value('peach') },
      { when: { $gte: [{ $var: 'open' }, { $const: 3 }] }, then: value('butter') },
    ],
    else: value('mint'),
  },
});

const MOOD_LABELS: Record<string, string> = {
  mint: 'calm',
  butter: 'cozy',
  peach: 'buzzing',
  blush: 'overloaded',
};

const todoStats: ReadEntry = {
  fingerprint: 'todos/stats',
  intent: 'Workload counters: open todos, overdue todos, and todos completed today',
  shape: SHAPES.stats,
  dsl: {
    from: ['todos'],
    aggregate: {
      open_count: countWhere({ eq: ['todos.done', false] }),
      overdue_count: countWhere({ and: [{ eq: ['todos.done', false] }, ...OVERDUE_CONDS] }),
      done_today: countWhere({
        and: [{ eq: ['todos.done', true] }, { eq: ['todos.done_on', { $context: 'today' }] }],
      }),
    },
  },
  mapping: {
    $with: {
      let: {
        open: { $coalesce: [{ $ref: '$.result.open_count' }, { $const: 0 }] },
        over: { $coalesce: [{ $ref: '$.result.overdue_count' }, { $const: 0 }] },
        dt: { $coalesce: [{ $ref: '$.result.done_today' }, { $const: 0 }] },
      },
      value: {
        open_count: { $var: 'open' },
        overdue_count: { $var: 'over' },
        done_today: { $var: 'dt' },
        mood: MOOD_BRANCHES((token) => ({ $const: token })),
        mood_label: MOOD_BRANCHES((token) => ({ $const: MOOD_LABELS[token] ?? token })),
      },
    },
  },
};

// No mapping: the identity IR returns the rows verbatim. The streak number is
// derived from these rows in the topbar endpoint's response transform.
const doneDays: ReadEntry = {
  fingerprint: 'todos/doneDays',
  intent: 'Distinct days on which a todo was completed, newest first',
  shape: SHAPES.doneDays,
  dsl: {
    from: ['todos'],
    fields: ['todos.done_on'],
    filter: { and: [{ eq: ['todos.done', true] }, { isNotNull: 'todos.done_on' }] },
    sort: [{ field: 'todos.done_on', dir: 'desc' }],
    distinct: true,
  },
};

export const readEntries = {
  todosOpen,
  gardenTodos,
  todoStats,
  doneDays,
} satisfies Record<string, ReadEntry>;
