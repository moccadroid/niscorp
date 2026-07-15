import type { ScopePolicy } from '@niscorp/vex';

// Server-side, LLM-invisible access control — ring 3, the unforgeable floor.
// Applied by the engine AFTER the DSL is authored, so a generated/injected
// request can't reference, forge, or omit it. `default: 'deny'` makes every
// entity an explicit decision: an unlisted entity does not read or write.
//
// The demo policy: CRM records are team-shared (read-open, creator-stamped
// writes); tasks are personal (reads AND mutations pinned to the assignee —
// the ring-3 mechanism proof, not a privacy measure; team-visible is the
// one-line flip to `read: []`). `$context.userId` filters in queries remain
// view intent — this policy is the floor under them.
export const scopePolicy: ScopePolicy = {
  default: 'deny',
  entities: {
    // Reference data — read-open, nothing writes it.
    users: { read: [] },
    pipelines: { read: [] },
    stages: { read: [] },
    products: { read: [] },
    deal_products: { read: [] },
    lists: { read: [] },
    list_members: { read: [] },
    actions: { read: [] },
    // Team-shared CRM records — read-open, creator stamped on INSERT.
    companies: { read: [], write: [{ set: 'owner_id', to: 'userId' }] },
    contacts: { read: [], write: [{ set: 'owner_id', to: 'userId' }] },
    deals: { read: [], write: [{ set: 'owner_id', to: 'userId' }] },
    activities: { read: [] },
    // Personal — reads filtered and mutations pinned to the assignee; the
    // assignee is stamped server-side on INSERT, never client-supplied.
    tasks: {
      read: [{ match: 'assignee_id', to: 'userId' }],
      write: [
        { set: 'assignee_id', to: 'userId' },
        { match: 'assignee_id', to: 'userId' },
      ],
    },
  },
};
