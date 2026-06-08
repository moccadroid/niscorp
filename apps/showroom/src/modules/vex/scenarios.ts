import type { Query, ScopeValues } from '@niscorp/vex';
import { ACCOUNTS } from './runtime/seed-data';

// ═══════════════════════════════════════════════════════════
// Canned scenarios — each is a real request (intent + shape) plus
// the DSL an agent would generate for it. The DSL is seeded into the
// cache at boot, so every story runs the genuine deterministic
// pipeline (resolve → scope → analyze → compile → execute) against
// PGlite with ZERO LLM calls — the shape-cache hot path Vex is built
// around. With a key set, the same stories can also be re-run live.
// ═══════════════════════════════════════════════════════════

export type ScenarioMode =
  // Seed the DSL into the cache and call engine.execute — shows the
  // full pipeline, rows, and the cache HIT badge.
  | 'execute'
  // Call engine.compile directly — used for analyzer demos where the
  // query is meant to be rejected before any SQL runs.
  | 'compile';

export type EditableContext = {
  key: string;
  label: string;
  // Preset values the visualizer offers; the first is the default.
  options: string[];
};

export type VexScenario = {
  id: string;
  name: string;
  description: string;
  kind: string; // sidebar grouping
  mode: ScenarioMode;
  intent: string;
  shape: unknown;
  dsl: Query;
  context?: Record<string, unknown>;
  // When set, the run uses scope and the visualizer shows an account
  // switcher bound to this scope key.
  scopeKey?: string;
  scope?: ScopeValues;
  // Context keys the visualizer exposes as editable controls (drives
  // the "same shape, different values → cache HIT" demo).
  editable?: EditableContext[];
  // Optional Prism mapping config (applied per row as the engine wraps
  // each row in { result: row }). Present only when the requested shape
  // genuinely differs from the SQL rows — e.g. nesting. Compiled to IR
  // and cached, so canned mapping runs with zero LLM.
  mapping?: unknown;
  note?: string;
};

export const KIND_BASICS = 'basics';
export const KIND_DSL = 'dsl';
export const KIND_SHAPE = 'shape';
export const KIND_SEARCH = 'search';
export const KIND_SCOPE = 'scope';
export const KIND_SAFETY = 'safety';
export const KIND_CACHING = 'caching';

export const scenarios: readonly VexScenario[] = [
  // ─── Basics ────────────────────────────────────────────────
  {
    id: 'top-customers',
    name: 'Top spenders',
    description:
      'The simplest path: an English ask becomes a DSL, compiles to parameterized SQL, runs, and returns rows shaped exactly as requested.',
    kind: KIND_BASICS,
    mode: 'execute',
    intent: 'Who are my biggest-spending customers?',
    shape: [{ name: '', total_spent: 0 }],
    dsl: {
      from: ['customers'],
      fields: ['customers.name', 'customers.total_spent'],
      sort: [{ field: 'customers.total_spent', dir: 'desc' }],
      limit: 5,
    },
  },
  {
    id: 'recent-orders',
    name: 'Recent orders',
    description: 'Select several fields, sort by recency, cap the result. No joins, no aggregation — just shaping rows.',
    kind: KIND_BASICS,
    mode: 'execute',
    intent: 'Show me the most recent orders with their status and total',
    shape: [{ id: '', status: '', total: 0, created_at: '' }],
    dsl: {
      from: ['orders'],
      fields: ['orders.id', 'orders.status', 'orders.total', 'orders.created_at'],
      sort: [{ field: 'orders.created_at', dir: 'desc' }],
      limit: 8,
    },
  },

  // ─── The DSL ───────────────────────────────────────────────
  {
    id: 'filter-and',
    name: 'Compound filter',
    description: 'A boolean filter tree — active AND under budget — compiled to a parameterized WHERE clause.',
    kind: KIND_DSL,
    mode: 'execute',
    intent: 'Active products that cost less than $100',
    shape: [{ name: '', price: 0 }],
    dsl: {
      from: ['products'],
      fields: ['products.name', 'products.price'],
      filter: {
        and: [
          { eq: ['products.active', true] },
          { lt: ['products.price', 100] },
        ],
      },
      sort: [{ field: 'products.price', dir: 'desc' }],
      limit: 10,
    },
  },
  {
    id: 'aggregate-group',
    name: 'Aggregate + group',
    description: 'Sum and count per group. Aggregates are named expressions; the alias becomes the output key.',
    kind: KIND_DSL,
    mode: 'execute',
    intent: 'Total revenue and order count for each order status',
    shape: [{ status: '', revenue: 0, orders: 0 }],
    dsl: {
      from: ['orders'],
      fields: ['orders.status'],
      aggregate: {
        revenue: { sum: 'orders.total' },
        orders: { count: '*' },
      },
      groupBy: ['orders.status'],
    },
  },
  {
    id: 'compute-case',
    name: 'Computed tier',
    description: 'A `case` expression derives a per-row value (a loyalty tier) without any post-processing in app code.',
    kind: KIND_DSL,
    mode: 'execute',
    intent: 'Label each customer with a loyalty tier based on lifetime spend',
    shape: [{ name: '', total_spent: 0, tier: '' }],
    dsl: {
      from: ['customers'],
      fields: ['customers.name', 'customers.total_spent'],
      compute: {
        tier: {
          case: {
            when: [
              { condition: { gte: ['customers.total_spent', 2000] }, then: 'platinum' },
              { condition: { gte: ['customers.total_spent', 1000] }, then: 'gold' },
            ],
            else: 'standard',
          },
        },
      },
      sort: [{ field: 'customers.total_spent', dir: 'desc' }],
      limit: 8,
    },
  },

  {
    id: 'join',
    name: 'Join across entities',
    description:
      'Two entities in `from`, fields from both — the resolver discovers the foreign key (orders.customer_id → customers.id) and emits the JOIN. No join is ever written by hand or by the model.',
    kind: KIND_DSL,
    mode: 'execute',
    intent: 'Show recent orders together with the customer who placed each one',
    shape: [{ id: '', total: 0, name: '', status: '' }],
    dsl: {
      from: ['orders', 'customers'],
      fields: ['orders.id', 'orders.total', 'customers.name', 'customers.status'],
      sort: [{ field: 'orders.total', dir: 'desc' }],
      limit: 8,
    },
  },
  {
    id: 'distinct',
    name: 'Distinct values',
    description: 'A `distinct` query collapses duplicates — here, the set of order statuses actually in use.',
    kind: KIND_DSL,
    mode: 'execute',
    intent: 'What distinct order statuses exist?',
    shape: [{ status: '' }],
    dsl: {
      from: ['orders'],
      fields: ['orders.status'],
      distinct: true,
      sort: [{ field: 'orders.status', dir: 'asc' }],
    },
  },

  // ─── Shaping (map to shape) ────────────────────────────────
  {
    id: 'shape-rename',
    name: 'Rename fields',
    description:
      'The SQL columns are `name`, `total_spent`, `status`; the UI wants `customer`, `spent`, `standing`. The Prism mapper renames each field — no app-side massaging, and the compiled transform is cached (zero LLM in canned mode).',
    kind: KIND_SHAPE,
    mode: 'execute',
    intent: 'Top customers as { customer, spent, standing }',
    shape: [{ customer: '', spent: 0, standing: '' }],
    dsl: {
      from: ['customers'],
      fields: ['customers.name', 'customers.total_spent', 'customers.status'],
      sort: [{ field: 'customers.total_spent', dir: 'desc' }],
      limit: 8,
    },
    mapping: {
      customer: { $ref: '$.result.name' },
      spent: { $ref: '$.result.total_spent' },
      standing: { $ref: '$.result.status' },
    },
  },
  {
    id: 'shape-nest',
    name: 'Nest an object',
    description:
      'A join returns flat rows (`id`, `total`, `name`, `email`); the requested shape nests the customer as an object under each order. The mapper restructures flat → nested.',
    kind: KIND_SHAPE,
    mode: 'execute',
    intent: 'Recent orders, each with its customer nested as an object',
    shape: [{ id: '', total: 0, customer: { name: '', email: '' } }],
    dsl: {
      from: ['orders', 'customers'],
      fields: ['orders.id', 'orders.total', 'customers.name', 'customers.email'],
      sort: [{ field: 'orders.total', dir: 'desc' }],
      limit: 8,
    },
    mapping: {
      id: { $ref: '$.result.id' },
      total: { $ref: '$.result.total' },
      customer: {
        name: { $ref: '$.result.name' },
        email: { $ref: '$.result.email' },
      },
    },
  },
  {
    id: 'shape-compute',
    name: 'Compute a field',
    description:
      'The shape asks for a single `contact` string the database never stored. The mapper builds it with `$join` from `name` and `email` — a computed, derived field produced entirely in the mapping step.',
    kind: KIND_SHAPE,
    mode: 'execute',
    intent: 'Customers as { contact: "Name <email>", spent }',
    shape: [{ contact: '', spent: 0 }],
    dsl: {
      from: ['customers'],
      fields: ['customers.name', 'customers.email', 'customers.total_spent'],
      sort: [{ field: 'customers.total_spent', dir: 'desc' }],
      limit: 8,
    },
    mapping: {
      contact: {
        $join: {
          sep: '',
          parts: [
            { $ref: '$.result.name' },
            { $const: ' <' },
            { $ref: '$.result.email' },
            { $const: '>' },
          ],
        },
      },
      spent: { $ref: '$.result.total_spent' },
    },
  },

  // ─── Search ────────────────────────────────────────────────
  {
    id: 'semantic-search',
    name: 'Semantic search',
    description:
      'A `semantic` filter embeds the query text and runs a real pgvector cosine search over the 1536-dim product vectors — meaning, not keywords.',
    kind: KIND_SEARCH,
    mode: 'execute',
    intent: 'Find products similar to “wireless noise-cancelling headphones”',
    shape: [{ name: '', price: 0 }],
    context: { q: 'wireless noise-cancelling headphones' },
    dsl: {
      from: ['products'],
      fields: ['products.name', 'products.price'],
      filter: { semantic: { field: 'products.embedding', query: { $context: 'q' } } },
      limit: 5,
    },
    editable: [
      {
        key: 'q',
        label: 'Query',
        options: [
          'wireless noise-cancelling headphones',
          'something to read on the beach',
          'gear for a weekend camping trip',
          'a powerful laptop for software development',
        ],
      },
    ],
    note: 'Offline, the demo queries map to a representative product vector. With an OpenAI key set, your text is embedded live.',
  },
  {
    id: 'fuzzy-search',
    name: 'Fuzzy match',
    description:
      'A `fuzzy` filter (no max distance → pg_trgm trigram similarity) matches misspelled product names — case-insensitive, typo-tolerant.',
    kind: KIND_SEARCH,
    mode: 'execute',
    intent: 'Search products by a misspelled name',
    shape: [{ name: '', price: 0 }],
    context: { q: 'mecanical keyboard' },
    dsl: {
      from: ['products'],
      fields: ['products.name', 'products.price'],
      filter: { fuzzy: { field: 'products.name', query: { $context: 'q' } } },
      limit: 5,
    },
    editable: [
      { key: 'q', label: 'Query', options: ['mecanical keyboard', 'samsng galaxy s25', 'wireles mouse', 'iphone'] },
    ],
  },

  // ─── Scope ─────────────────────────────────────────────────
  {
    id: 'scope-orders',
    name: 'Row-level scope',
    description:
      'Access control the model never sees. The engine AND-merges an `account_id = $scope` filter into the DSL after generation — switch accounts and watch the rows change. Prompt injection can’t bypass it.',
    kind: KIND_SCOPE,
    mode: 'execute',
    intent: 'List orders for my account',
    shape: [{ id: '', status: '', total: 0 }],
    dsl: {
      from: ['orders'],
      fields: ['orders.id', 'orders.status', 'orders.total'],
      sort: [{ field: 'orders.created_at', dir: 'desc' }],
      limit: 8,
    },
    scopeKey: 'accountId',
    scope: { accountId: ACCOUNTS[0] },
  },

  // ─── Safety ────────────────────────────────────────────────
  {
    id: 'analyzer-warning',
    name: 'Unindexed warning',
    description:
      'Filtering on an unindexed column (`description`) still runs, but the analyzer attaches a warning so slow queries surface in review.',
    kind: KIND_SAFETY,
    mode: 'execute',
    intent: 'Products whose description mentions “cancelling”',
    shape: [{ name: '', price: 0 }],
    dsl: {
      from: ['products'],
      fields: ['products.name', 'products.price'],
      filter: { ilike: ['products.description', '%cancelling%'] },
      limit: 10,
    },
  },
  {
    id: 'analyzer-cartesian',
    name: 'Cartesian rejected',
    description:
      'Two unrelated entities with no connecting join is a cartesian product. The analyzer rejects it before any SQL is generated — a class of accidental full-table blow-ups that never reaches the database.',
    kind: KIND_SAFETY,
    mode: 'compile',
    intent: 'Orders and products in one query (with nothing joining them)',
    shape: [{ id: '', name: '' }],
    dsl: {
      from: ['orders', 'products'],
      fields: ['orders.id', 'products.name'],
      limit: 10,
    },
  },

  // ─── Caching ───────────────────────────────────────────────
  {
    id: 'shape-cache',
    name: 'Same shape, zero cost',
    description:
      'The cache is keyed by output shape, not by values. Change the status and re-run: same shape → cache HIT → the DSL is reused, no LLM call, only the deterministic pipeline runs again with the new value.',
    kind: KIND_CACHING,
    mode: 'execute',
    intent: 'Customers with a given status',
    shape: [{ name: '', status: '' }],
    context: { status: 'active' },
    dsl: {
      from: ['customers'],
      fields: ['customers.name', 'customers.status'],
      filter: { eq: ['customers.status', { $context: 'status' }] },
      limit: 20,
    },
    editable: [
      { key: 'status', label: 'Status', options: ['active', 'inactive', 'suspended'] },
    ],
  },
];
