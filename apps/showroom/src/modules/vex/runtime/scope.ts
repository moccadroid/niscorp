import type { ScopePolicy } from '@niscorp/vex';

// Server-side, LLM-invisible access control. `orders` is the only
// seeded table with a tenant column (account_id), so it carries the
// row-level filter the scope demo switches on. Everything else is
// public (default: 'allow') so the non-scope stories run unfiltered.
//
// At query time the engine AND-merges
//   { eq: ["orders.account_id", { $scope: "accountId" }] }
// into the generated DSL — only when options.scope provides accountId.
export const scopePolicy: ScopePolicy = {
  default: 'allow',
  entities: {
    orders: { read: [{ match: 'account_id', to: 'accountId' }] },
  },
};

// The write side — the SAME ScopePolicy grammar, handed to the handler as
// `mutations.policy`. Deliberately `default: 'deny'`: a write phase a table
// doesn't have is a verb that doesn't exist (the read policy above stays
// `allow` so the read stories run unfiltered).
//
//   - `write`  is the UMBRELLA phase: present = insert/update/delete all
//     granted, its rules applying to each. `products` uses it, rule-free.
//   - `insert`/`update`/`delete` are SPECIFIC phases: each grants just its
//     op. `orders` grants insert + update — every write stamps the tenant
//     column from scope (`set`, applied on insert AND update) and update is
//     pinned to your own rows (`match`). `delete` is absent ON PURPOSE:
//     no phase, no verb — the deny-by-absence demo.
export const mutationPolicy: ScopePolicy = {
  default: 'deny',
  entities: {
    products: { write: [] },
    orders: {
      insert: [{ set: 'account_id', to: 'accountId' }],
      update: [
        { set: 'account_id', to: 'accountId' },
        { match: 'account_id', to: 'accountId' },
      ],
    },
    // The onConflict demos. `customers` grants insert AND update because its
    // create-or-fetch entry declares DO UPDATE — an update by another name,
    // gated like one (insert alone would refuse it). `product_tags` is
    // insert-only: its entry uses DO NOTHING, which needs no update grant.
    customers: { insert: [], update: [] },
    product_tags: { insert: [] },
    // A $lookup READS its table under THIS policy — `tags` needs a read
    // phase here or the tag-by-name lookup is refused (default: deny).
    tags: { read: [] },
    // The insertEach demo.
    order_items: { insert: [] },
  },
};
