import type { CacheEntry } from './index';
import type { Mutation } from '@relay/vex/mutations';
import { money, dateText } from '@relay/lib/format.prism';

// The deals table. Joined names + the id are aliased in the DSL (distinct shape,
// no `name` collisions); the mapping builds each shape field and formats
// value/close-date.
export const dealsList: CacheEntry = {
  intent: 'List all deals with company, stage, owner, value and dates for the deals table',
  shape: [{ deal_id: '', title: '', company: '', company_id: '', stage: '', stage_id: '', owner: '', value: 0, value_display: '', status: '', close_date: '', close_date_display: '', created_at: '', primary_contact_id: '' }],
  dsl: {
    from: ['deals', 'companies', 'stages', 'users'],
    fields: [
      { field: 'deals.id', as: 'deal_id' },
      'deals.title',
      'deals.value',
      'deals.status',
      'deals.close_date',
      'deals.created_at',
      'deals.company_id',
      'deals.stage_id',
      'deals.primary_contact_id',
      { field: 'companies.name', as: 'company' },
      { field: 'stages.name', as: 'stage' },
      { field: 'users.name', as: 'owner' },
    ],
    filter: { or: [{ ilike: ['deals.title', { $context: 'q' }] }, { ilike: ['companies.name', { $context: 'q' }] }] },
    sort: [{ field: 'deals.created_at', dir: 'desc' }],
    limit: 200,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        company: { $get: { from: { $var: 'r' }, path: ['company'] } },
        company_id: { $get: { from: { $var: 'r' }, path: ['company_id'] } },
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
        stage_id: { $get: { from: { $var: 'r' }, path: ['stage_id'] } },
        owner: { $get: { from: { $var: 'r' }, path: ['owner'] } },
        value: { $get: { from: { $var: 'r' }, path: ['value'] } },
        value_display: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        close_date: { $get: { from: { $var: 'r' }, path: ['close_date'] } },
        close_date_display: dateText({ $get: { from: { $var: 'r' }, path: ['close_date'] } }),
        created_at: dateText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
        primary_contact_id: { $get: { from: { $var: 'r' }, path: ['primary_contact_id'] } },
      },
    },
  },
};

// One owner's deals. Carries the same raw edit-seed fields as `dealsList`
// (stage_id / company_id / primary_contact_id / raw close_date) so a row's ⋯ →
// Edit works on the My-deals tab too, plus `owner_id` — which both keeps the
// shape DISTINCT from `dealsList` (so the shape-keyed cache doesn't conflate
// them) and records whose deals these are.
export const dealsByOwner: CacheEntry = {
  intent: "List a user's deals with company, stage, value and dates",
  shape: [{ deal_id: '', title: '', company: '', company_id: '', stage: '', stage_id: '', owner: '', owner_id: '', value: 0, value_display: '', status: '', close_date: '', close_date_display: '', created_at: '', primary_contact_id: '' }],
  dsl: {
    from: ['deals', 'companies', 'stages', 'users'],
    fields: [
      { field: 'deals.id', as: 'deal_id' },
      'deals.title',
      'deals.value',
      'deals.status',
      'deals.close_date',
      'deals.created_at',
      'deals.company_id',
      'deals.stage_id',
      'deals.primary_contact_id',
      'deals.owner_id',
      { field: 'companies.name', as: 'company' },
      { field: 'stages.name', as: 'stage' },
      { field: 'users.name', as: 'owner' },
    ],
    filter: {
      and: [
        { eq: ['deals.owner_id', { $context: 'ownerId' }] },
        { or: [{ ilike: ['deals.title', { $context: 'q' }] }, { ilike: ['companies.name', { $context: 'q' }] }] },
      ],
    },
    sort: [{ field: 'deals.created_at', dir: 'desc' }],
    limit: 200,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        company: { $get: { from: { $var: 'r' }, path: ['company'] } },
        company_id: { $get: { from: { $var: 'r' }, path: ['company_id'] } },
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
        stage_id: { $get: { from: { $var: 'r' }, path: ['stage_id'] } },
        owner: { $get: { from: { $var: 'r' }, path: ['owner'] } },
        owner_id: { $get: { from: { $var: 'r' }, path: ['owner_id'] } },
        value: { $get: { from: { $var: 'r' }, path: ['value'] } },
        value_display: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        close_date: { $get: { from: { $var: 'r' }, path: ['close_date'] } },
        close_date_display: dateText({ $get: { from: { $var: 'r' }, path: ['close_date'] } }),
        created_at: dateText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
        primary_contact_id: { $get: { from: { $var: 'r' }, path: ['primary_contact_id'] } },
      },
    },
  },
};

// One deal by id — the deal workspace's record. The mapping keeps value/close
// as the RAW underlying values (a number, a 'YYYY-MM-DD' string) AND adds
// `*_display` formatted strings: the view binds the display fields, the edit form
// seeds the raw ones (so a numeric/date input round-trips). `stage_id` (raw) is
// here too, so the edit Stage select pre-selects.
export const dealById: CacheEntry = {
  intent: 'Load one deal by id — company, stage, owner, win-% and primary contact id',
  shape: { deal_id: '', title: '', company: '', company_id: '', stage: '', stage_id: '', owner: '', owner_id: '', value: 0, value_display: '', status: '', close_date: '', close_date_display: '', prob: 0, primary_contact_id: '' },
  dsl: {
    from: ['deals', 'companies', 'stages', 'users'],
    fields: [
      { field: 'deals.id', as: 'deal_id' },
      'deals.title',
      'deals.value',
      'deals.status',
      'deals.close_date',
      'deals.company_id',
      'deals.owner_id',
      'deals.stage_id',
      'deals.primary_contact_id',
      { field: 'stages.win_probability', as: 'prob' },
      { field: 'companies.name', as: 'company' },
      { field: 'stages.name', as: 'stage' },
      { field: 'users.name', as: 'owner' },
    ],
    filter: { eq: ['deals.id', { $context: 'id' }] },
    limit: 1,
  },
  mapping: {
    deal_id: { $ref: '$.result.deal_id' },
    title: { $ref: '$.result.title' },
    company: { $ref: '$.result.company' },
    company_id: { $ref: '$.result.company_id' },
    stage: { $ref: '$.result.stage' },
    stage_id: { $ref: '$.result.stage_id' },
    owner: { $ref: '$.result.owner' },
    owner_id: { $ref: '$.result.owner_id' },
    value: { $ref: '$.result.value' },
    value_display: money({ $ref: '$.result.value' }),
    status: { $ref: '$.result.status' },
    close_date: { $ref: '$.result.close_date' },
    close_date_display: dateText({ $ref: '$.result.close_date' }),
    prob: { $ref: '$.result.prob' },
    primary_contact_id: { $ref: '$.result.primary_contact_id' },
  },
};

// A company's open deals with stage — raw value + money-formatted display.
export const dealsByCompany: CacheEntry = {
  intent: "List a company's open deals with stage",
  shape: [{ deal_id: '', title: '', value: 0, value_display: '', stage: '' }],
  dsl: {
    from: ['deals', 'stages'],
    fields: [{ field: 'deals.id', as: 'deal_id' }, 'deals.title', 'deals.value', { field: 'stages.name', as: 'stage' }],
    filter: { and: [{ eq: ['deals.company_id', { $context: 'companyId' }] }, { eq: ['deals.status', 'open'] }] },
    sort: [{ field: 'deals.value', dir: 'desc' }],
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        value: { $get: { from: { $var: 'r' }, path: ['value'] } },
        value_display: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
      },
    },
  },
};

// A contact's deals (ANY status) where they're the primary contact — open AND
// closed, so the deal behind a closed-deal activity is visible on the panel (a
// lost deal with five logged activities would otherwise look sourceless). `tone`
// colours the badge by status (won=green, lost=red, open=blue); the `status`/
// `tone` keys also keep the shape distinct from `dealsByCompany` in the cache.
export const dealsByContact: CacheEntry = {
  intent: "List a contact's deals (any status) where they are the primary contact",
  shape: [{ deal_id: '', title: '', value: 0, value_display: '', stage: '', status: '', tone: '' }],
  dsl: {
    from: ['deals', 'stages'],
    fields: [{ field: 'deals.id', as: 'deal_id' }, 'deals.title', 'deals.value', 'deals.status', { field: 'stages.name', as: 'stage' }],
    filter: { eq: ['deals.primary_contact_id', { $context: 'contactId' }] },
    sort: [{ field: 'deals.value', dir: 'desc' }],
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        value: { $get: { from: { $var: 'r' }, path: ['value'] } },
        value_display: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        tone: {
          $case: {
            branches: [
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'won'] }, then: 'green' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'lost'] }, then: 'red' },
            ],
            else: 'blue',
          },
        },
      },
    },
  },
};

// Open deals for the board cards.
export const dealsBoard: CacheEntry = {
  intent: 'List open deals with company, owner, stage, value and close date for the pipeline board',
  shape: [{ deal_id: '', company: '', owner: '', stage: '', value: 0, value_display: '', close_date: '' }],
  dsl: {
    from: ['deals', 'companies', 'stages', 'users'],
    fields: [
      { field: 'deals.id', as: 'deal_id' },
      'deals.value',
      'deals.close_date',
      { field: 'companies.name', as: 'company' },
      { field: 'stages.name', as: 'stage' },
      { field: 'users.name', as: 'owner' },
    ],
    filter: { eq: ['deals.status', 'open'] },
    sort: [{ field: 'deals.created_at', dir: 'desc' }],
    limit: 500,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
        company: { $get: { from: { $var: 'r' }, path: ['company'] } },
        owner: { $get: { from: { $var: 'r' }, path: ['owner'] } },
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
        value: { $get: { from: { $var: 'r' }, path: ['value'] } },
        value_display: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        close_date: dateText({ $get: { from: { $var: 'r' }, path: ['close_date'] } }),
      },
    },
  },
};

// Open deals per stage — count, total value, win-%, colour tone, in stage order.
export const dealsOpenByStage: CacheEntry = {
  intent: 'Open deals per pipeline stage — count, total value, win %, in stage order',
  shape: [{ stage: '', stage_id: '', count: 0, value: '', prob: 0, tone: '' }],
  dsl: {
    from: ['deals', 'stages'],
    fields: [{ field: 'stages.id', as: 'stage_id' }, { field: 'stages.name', as: 'stage' }, { field: 'stages.win_probability', as: 'prob' }],
    aggregate: { count: { count: '*' }, value: { sum: 'deals.value' } },
    filter: { eq: ['deals.status', 'open'] },
    groupBy: ['stages.id', 'stages.name', 'stages.position', 'stages.win_probability'],
    sort: [{ field: 'stages.position', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
        stage_id: { $get: { from: { $var: 'r' }, path: ['stage_id'] } },
        count: { $get: { from: { $var: 'r' }, path: ['count'] } },
        value: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        prob: { $get: { from: { $var: 'r' }, path: ['prob'] } },
        tone: {
          $case: {
            branches: [
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['stage'] } }, 'Lead'] }, then: 'slate' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['stage'] } }, 'Qualified'] }, then: 'blue' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['stage'] } }, 'Proposal'] }, then: 'amber' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['stage'] } }, 'Negotiation'] }, then: 'pink' },
            ],
            else: 'slate',
          },
        },
      },
    },
  },
};

// Forecast — open pipeline total + weighted. The aggregation is in VEX: SUM of a
// field, and SUM of an expression (value × win-%). win-% is 0–100, so the
// weighted sum is /100 in the formatter (a unit scale, not aggregation). One
// aggregated row → an object shape.
export const dealsForecast: CacheEntry = {
  intent: 'Open pipeline total and weighted forecast',
  shape: { total: '', weighted: '' },
  dsl: {
    from: ['deals', 'stages'],
    aggregate: {
      total: { sum: 'deals.value' },
      weighted_pct: { sum: { multiply: ['deals.value', 'stages.win_probability'] } },
    },
    filter: { eq: ['deals.status', 'open'] },
  },
  mapping: {
    total: money({ $ref: '$.result.total' }),
    weighted: money({ $div: [{ $ref: '$.result.weighted_pct' }, 100] }),
  },
};

// Total value + count of deals for ONE status (via $context.status) — one
// aggregated row → an object. The dashboard runs it for open and won.
export const dealsByStatus: CacheEntry = {
  intent: 'Total value and count of deals for a given status',
  shape: { status: '', value: '', count: 0 },
  dsl: {
    from: ['deals'],
    fields: ['deals.status'],
    aggregate: { value: { sum: 'deals.value' }, count: { count: '*' } },
    filter: { eq: ['deals.status', { $context: 'status' }] },
    groupBy: ['deals.status'],
  },
  mapping: {
    status: { $ref: '$.result.status' },
    value: money({ $ref: '$.result.value' }),
    count: { $ref: '$.result.count' },
  },
};

// Count + total value per stage (the home dashboard table).
export const dealsByStage: CacheEntry = {
  intent: 'Count and total deal value grouped by stage',
  shape: [{ name: '', count: 0, value: '' }],
  dsl: {
    from: ['deals', 'stages'],
    fields: ['stages.name'],
    aggregate: { count: { count: '*' }, value: { sum: 'deals.value' } },
    groupBy: ['stages.name'],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        name: { $get: { from: { $var: 'r' }, path: ['name'] } },
        count: { $get: { from: { $var: 'r' }, path: ['count'] } },
        value: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
      },
    },
  },
};

// Pickers for the deal form. Each is `{ <entity>_id, name }` — ENTITY-DISTINCT
// shapes on the `<entity>_id` convention, so the shape-keyed cache keeps them
// apart (a shared `{ value, label }` would collide on one entry — the Stage
// dropdown would show companies). The Select reads them via valueKey/labelKey.
export const companyOptions: CacheEntry = {
  intent: 'Companies as id/name options for a picker',
  shape: [{ company_id: '', name: '' }],
  dsl: {
    from: ['companies'],
    fields: [{ field: 'companies.id', as: 'company_id' }, 'companies.name'],
    sort: [{ field: 'companies.name', dir: 'asc' }],
    limit: 500,
  },
};

export const stageOptions: CacheEntry = {
  intent: 'In-progress pipeline stages as id/name options, in order (excludes the terminal Closed Won/Lost — those are reached by marking a deal won/lost, not by picking the stage; an open deal in a terminal stage would have no board column)',
  shape: [{ stage_id: '', name: '' }],
  dsl: {
    from: ['stages'],
    fields: [{ field: 'stages.id', as: 'stage_id' }, 'stages.name'],
    filter: { and: [{ gt: ['stages.win_probability', 0] }, { lt: ['stages.win_probability', 100] }] },
    sort: [{ field: 'stages.position', dir: 'asc' }],
  },
};

export const contactOptions: CacheEntry = {
  intent: 'Contacts as id/name options for a picker',
  shape: [{ contact_id: '', name: '' }],
  dsl: {
    from: ['contacts'],
    fields: [{ field: 'contacts.id', as: 'contact_id' }],
    compute: { name: { concat: ['contacts.first_name', ' ', 'contacts.last_name'] } },
    sort: [{ field: 'contacts.last_name', dir: 'asc' }],
    limit: 500,
  },
};

// Create-or-edit a deal. `company_id`/`stage_id`/`primary_contact_id` are real FK
// ids (the form's id-bearing selects). `upsert` keys on `id`. `owner_id` is scope-stamped on
// insert; `status`/`currency`/`id` default in the DB on create. The input prism
// coerces empty value→0 and empty FK/date→null.
export const dealUpsert: Mutation = {
  op: 'upsert',
  table: 'deals',
  key: 'id',
  columns: {
    title: { $context: 'title' },
    company_id: { $context: 'company_id' },
    stage_id: { $context: 'stage_id' },
    primary_contact_id: { $context: 'primary_contact_id' },
    value: { $context: 'value' },
    close_date: { $context: 'close_date' },
  },
};

// ── Writes ──────────────────────────────────────────────────
// Move a deal to a stage (the board's drag-drop). `stage_id` + `deal_id` arrive
// via the board's mutation input prism.
export const dealMoveStage: Mutation = {
  op: 'update',
  table: 'deals',
  set: { stage_id: { $context: 'stage_id' } },
  where: { eq: ['deals.id', { $context: 'deal_id' }] },
};

// Close a deal won / lost — the status is a literal per endpoint; only `deal_id`
// comes from context (the open deal).
export const dealMarkWon: Mutation = {
  op: 'update',
  table: 'deals',
  set: { status: 'won' },
  where: { eq: ['deals.id', { $context: 'deal_id' }] },
};

export const dealMarkLost: Mutation = {
  op: 'update',
  table: 'deals',
  set: { status: 'lost' },
  where: { eq: ['deals.id', { $context: 'deal_id' }] },
};

// Delete a deal by id (the row ⋯ → Delete, behind a confirm). The schema CASCADEs
// the deal's line items (deal_products) and SET NULLs activities/tasks that point
// at it, so the delete never FK-fails.
export const dealDelete: Mutation = {
  op: 'delete',
  table: 'deals',
  where: { eq: ['deals.id', { $context: 'id' }] },
};
