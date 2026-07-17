import type { Query, ScopeValues, MutationDefinition } from '@niscorp/vex';
import { ACCOUNTS, DEMO_CUSTOMER_ID, DEMO_PRODUCT_ID, DEMO_ORDER_ID } from './runtime/seed-data';

// ═══════════════════════════════════════════════════════════
// Canned scenarios — each is a real request (intent + shape) plus
// the DSL an agent would generate for it. The DSL is seeded into the
// cache under a named fingerprint (`vex-demo/<id>`), so every story
// replays the genuine deterministic pipeline (resolve → scope →
// analyze → compile → execute) against PGlite with ZERO LLM calls —
// the fingerprint-replay hot path Vex is built around. With a key
// set, the same stories can also be re-run live.
// ═══════════════════════════════════════════════════════════

export type ScenarioMode =
  // Seed the DSL into the cache and call engine.execute — shows the
  // full pipeline, rows, and the cache HIT badge.
  | 'execute'
  // Call engine.compile directly — used for analyzer demos where the
  // query is meant to be rejected before any SQL runs.
  | 'compile'
  // Seed a `kind: 'mutation'` entry and drive the request through the
  // REAL wire dispatch (handleQuery): one wire shape, { fingerprint,
  // context } — the entry's kind picks the write pipeline. Writes are
  // replay-only, so there is no live/LLM variant to toggle.
  | 'mutate';

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
  // The read DSL (execute/compile modes). Absent on 'mutate' — a mutation
  // definition is a different artifact and it NEVER travels.
  dsl?: Query;
  // The mutation definition seeded under this scenario's fingerprint
  // ('mutate' mode). What an app seeds at boot; the wire never carries it.
  mutation?: MutationDefinition;
  // Raw wire-body override ('mutate' mode): POST exactly this instead of
  // { fingerprint, context } — used to demo the shapes the wire REFUSES.
  body?: unknown;
  context?: Record<string, unknown>;
  // When set, the run uses scope and the visualizer shows an account
  // switcher bound to this scope key.
  scopeKey?: string;
  scope?: ScopeValues;
  // Context keys the visualizer exposes as editable controls (drives
  // the "same fingerprint, different values → cache HIT" demo).
  editable?: EditableContext[];
  // Replay-only endpoint ('execute'): canned replays the seeded fingerprint
  // (works, zero LLM); toggling Live attempts ad-hoc generation and is
  // REFUSED with `locked` — the "seed it, then lock it" story.
  locked?: boolean;
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
export const KIND_MUTATIONS = 'mutations';
export const KIND_SAFETY = 'safety';
export const KIND_CACHING = 'caching';

// The one mutation definition two scenarios share: the create demo replays
// it whole; the missing-context demo replays it with a hole.
const ORDER_CREATE: MutationDefinition = {
  op: 'insert',
  table: 'orders',
  values: {
    customer_id: { $context: 'customer_id' },
    total: { $context: 'total' },
  },
};

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
    id: 'count-total',
    name: 'Bare count (no fields)',
    description: 'An aggregate-only query — no `fields` at all. The object shape returns a single object: Vex maps the one aggregated row.',
    kind: KIND_DSL,
    mode: 'execute',
    intent: 'How many orders are there in total?',
    shape: { orders: 0 },
    dsl: {
      from: ['orders'],
      aggregate: { orders: { count: '*' } },
    },
  },
  {
    id: 'field-alias',
    name: 'Field alias (as)',
    description: 'A `{ field, as }` entry sets a distinct output key — the joined customer name becomes `customer`, so it never collides with other `name` columns and needs no compute.',
    kind: KIND_DSL,
    mode: 'execute',
    intent: "The biggest orders with each customer's name",
    shape: [{ id: '', customer: '', total: 0 }],
    dsl: {
      from: ['orders', 'customers'],
      fields: ['orders.id', { field: 'customers.name', as: 'customer' }, 'orders.total'],
      sort: [{ field: 'orders.total', dir: 'desc' }],
      limit: 8,
    },
  },
  {
    id: 'aggregate-expression',
    name: 'Aggregate an expression',
    description: 'SUM of a derived value — `quantity × unit_price` — per order. `sum`/`avg`/`min`/`max` take a compute expression, not just a column.',
    kind: KIND_DSL,
    mode: 'execute',
    intent: 'Total line-item revenue for each order',
    shape: [{ order_id: '', revenue: 0 }],
    dsl: {
      from: ['order_items'],
      fields: [{ field: 'order_items.order_id', as: 'order_id' }],
      aggregate: { revenue: { sum: { multiply: ['order_items.quantity', 'order_items.unit_price'] } } },
      groupBy: ['order_items.order_id'],
      limit: 8,
    },
  },
  {
    id: 'single-record',
    name: 'Single record (object shape)',
    description: 'An object shape (not an array) returns one object: Vex maps the single — here the top-spending — customer, so the mapping reads `$.result.field` (no index).',
    kind: KIND_SHAPE,
    mode: 'execute',
    intent: 'The top customer by lifetime spend, as one record',
    shape: { name: '', email: '', spent: 0 },
    dsl: {
      from: ['customers'],
      fields: ['customers.name', 'customers.email', 'customers.total_spent'],
      sort: [{ field: 'customers.total_spent', dir: 'desc' }],
      limit: 1,
    },
    mapping: {
      name: { $ref: '$.result.name' },
      email: { $ref: '$.result.email' },
      spent: { $ref: '$.result.total_spent' },
    },
  },
  {
    id: 'cross-join-counts',
    name: 'Counts across tables (one query)',
    description: 'Independent COUNT(*) subqueries with no foreign key between them cross-join into a SINGLE row. One read returns { customers, orders, products }; the object shape maps that one row — no per-table round-trips.',
    kind: KIND_DSL,
    mode: 'execute',
    intent: 'How many customers, orders and products are there in total?',
    shape: { customers: 0, orders: 0, products: 0 },
    dsl: {
      from: [
        { as: 'c', query: { from: ['customers'], aggregate: { n: { count: '*' } } } },
        { as: 'o', query: { from: ['orders'], aggregate: { n: { count: '*' } } } },
        { as: 'p', query: { from: ['products'], aggregate: { n: { count: '*' } } } },
      ],
      fields: [
        { field: 'c.n', as: 'customers' },
        { field: 'o.n', as: 'orders' },
        { field: 'p.n', as: 'products' },
      ],
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
      $map: {
        over: { $ref: '$.result' },
        as: 'row',
        body: {
          customer: { $get: { from: { $var: 'row' }, path: ['name'] } },
          spent: { $get: { from: { $var: 'row' }, path: ['total_spent'] } },
          standing: { $get: { from: { $var: 'row' }, path: ['status'] } },
        },
      },
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
      $map: {
        over: { $ref: '$.result' },
        as: 'row',
        body: {
          id: { $get: { from: { $var: 'row' }, path: ['id'] } },
          total: { $get: { from: { $var: 'row' }, path: ['total'] } },
          customer: {
            name: { $get: { from: { $var: 'row' }, path: ['name'] } },
            email: { $get: { from: { $var: 'row' }, path: ['email'] } },
          },
        },
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
      $map: {
        over: { $ref: '$.result' },
        as: 'row',
        body: {
          contact: {
            $join: {
              sep: '',
              parts: [
                { $get: { from: { $var: 'row' }, path: ['name'] } },
                { $const: ' <' },
                { $get: { from: { $var: 'row' }, path: ['email'] } },
                { $const: '>' },
              ],
            },
          },
          spent: { $get: { from: { $var: 'row' }, path: ['total_spent'] } },
        },
      },
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
    id: 'fingerprint-replay',
    name: 'The published endpoint',
    description:
      'This is how an app ships a read: the DSL is generated ONCE and seeded under a name; the wire then carries only { fingerprint, context }. The fingerprint IS the API — context values are runtime data, not identity. Change the status and re-run: same fingerprint → HIT → the DSL replays, no LLM, only the deterministic pipeline runs again with the new value.',
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
  {
    id: 'locked-endpoint',
    name: 'Then lock it',
    description:
      'A locked endpoint is replay-only. CANNED replays the seeded fingerprint — your published API, zero LLM. Toggle LIVE (ad-hoc generation) and the wire refuses it: `locked`. That is the production posture — seed your reads, lock the endpoint, and only fingerprints get through; keep one unlocked endpoint elsewhere for genuine queries.',
    kind: KIND_CACHING,
    mode: 'execute',
    locked: true,
    intent: 'Products whose name matches a term',
    shape: [{ name: '', price: 0 }],
    context: { term: '%o%' },
    dsl: {
      from: ['products'],
      fields: ['products.name', 'products.price'],
      filter: { ilike: ['products.name', { $context: 'term' }] },
      sort: [{ field: 'products.name', dir: 'asc' }],
      limit: 20,
    },
    editable: [
      { key: 'term', label: 'Name contains', options: ['%o%', '%pro%', '%phone%'] },
    ],
  },

  // ─── Mutations ─────────────────────────────────────────────
  // Writes are REPLAY-ONLY: definitions are seeded server-side (an app
  // seeds them at boot; here the scenario seeds on first run) and are
  // NEVER generated and NEVER travel. The wire carries the same shape a
  // read replay does — { fingerprint, context } — and the entry's kind
  // picks the write pipeline. These run through the real handler, so the
  // refusal demos show genuine wire statuses.
  {
    id: 'mutation-create',
    name: 'Create (replay-only)',
    description:
      'An INSERT as a seeded definition. The wire carries only { fingerprint, context } — the same shape as a read replay. The DB defaults the id; the tenant column is stamped from scope by the policy (`set`, server-side), never client-supplied. RETURNING * is the result.',
    kind: KIND_MUTATIONS,
    mode: 'mutate',
    intent: 'Create an order for Alice',
    shape: { id: '', customer_id: '', status: '', total: 0, account_id: '' },
    mutation: ORDER_CREATE,
    context: { customer_id: DEMO_CUSTOMER_ID, total: '129.99' },
    editable: [{ key: 'total', label: 'Total', options: ['129.99', '49.50', '2499.00'] }],
    scopeKey: 'accountId',
    scope: { accountId: ACCOUNTS[0] },
    note: 'Switch the account and re-run: the stamped account_id follows the scope — the definition, the context, and the wire body never change.',
  },
  {
    id: 'mutation-update',
    name: 'Update by key',
    description:
      'A plain UPDATE, caller-bounded by a $context key. Context values are SQL parameters exactly as in reads: re-run with a different price — same fingerprint, new value. (Products carry the `write` UMBRELLA phase with no row rules; a form-shaped app would use the `upsert` sugar — id present desugars to this.)',
    kind: KIND_MUTATIONS,
    mode: 'mutate',
    intent: 'Change the price of the iPhone 16 Pro',
    shape: { id: '', name: '', price: 0 },
    mutation: {
      op: 'update',
      table: 'products',
      set: { price: { $context: 'price' } },
      where: { eq: ['products.id', { $context: 'id' }] },
    },
    context: { id: DEMO_PRODUCT_ID, price: '899.00' },
    editable: [{ key: 'price', label: 'Price', options: ['899.00', '1099.00', '749.50'] }],
  },
  {
    id: 'mutation-pin',
    name: 'Pinned to your rows',
    description:
      "The order belongs to Account A. The update phase carries a `match` rule, so the engine ANDs `account_id = $scope` into the WHERE — as Account A the row returns updated; as Account B it returns 0 rows. Not an error: the row simply isn't yours to touch.",
    kind: KIND_MUTATIONS,
    mode: 'mutate',
    intent: "Mark Account A's order shipped",
    shape: { id: '', status: '', account_id: '' },
    mutation: {
      op: 'update',
      table: 'orders',
      set: { status: { $context: 'status' } },
      where: { eq: ['orders.id', { $context: 'id' }] },
    },
    context: { id: DEMO_ORDER_ID, status: 'shipped' },
    editable: [{ key: 'status', label: 'Status', options: ['shipped', 'delivered', 'processing'] }],
    scopeKey: 'accountId',
    scope: { accountId: ACCOUNTS[0] },
  },
  {
    id: 'mutation-denied',
    name: 'No phase, no verb',
    description:
      'The policy grants orders `insert` and `update` as SPECIFIC phases; `delete` has no phase and the policy defaults to deny — for this caller the verb does not exist. The wire answers 400 scope_denied. Deny-by-absence: nobody wrote a delete rule, so there is nothing to get past.',
    kind: KIND_MUTATIONS,
    mode: 'mutate',
    intent: 'Delete an order',
    shape: {},
    mutation: {
      op: 'delete',
      table: 'orders',
      where: { eq: ['orders.id', { $context: 'id' }] },
    },
    context: { id: DEMO_ORDER_ID },
    scopeKey: 'accountId',
    scope: { accountId: ACCOUNTS[0] },
  },
  {
    id: 'mutation-missing-context',
    name: 'Writes never run with holes',
    description:
      "The same create definition, replayed WITHOUT `total`. A read with missing context runs and warns (meta.missingContext); a write refuses outright — 400 missing_context, carrying the definition's full derived signature (every $context key, computed from the definition itself, never authored).",
    kind: KIND_MUTATIONS,
    mode: 'mutate',
    intent: 'Create an order — but forget the total',
    shape: {},
    mutation: ORDER_CREATE,
    context: { customer_id: DEMO_CUSTOMER_ID },
    scopeKey: 'accountId',
    scope: { accountId: ACCOUNTS[0] },
  },
  {
    id: 'mutation-inline-refused',
    name: 'Definitions never travel',
    description:
      'A client POSTs a well-formed mutation definition inline. It is not a request shape at all — the wire knows exactly two write-relevant forms, and { mutation } is neither. 400 invalid_request, before any engine work. This is the replay-only posture: what is not seeded does not exist.',
    kind: KIND_MUTATIONS,
    mode: 'mutate',
    intent: 'Smuggle a mutation definition through the wire',
    shape: {},
    body: {
      mutation: { op: 'delete', table: 'orders', where: { eq: ['orders.id', 'anything'] } },
    },
  },
];
