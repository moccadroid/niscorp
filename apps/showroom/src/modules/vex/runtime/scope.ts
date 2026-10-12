import type { ScopePolicy } from '@niscorp/vex';

// `orders` is the only seeded table with a tenant column (account_id). Under this
// policy the engine refuses a read of `orders` that names no accountId.
export const scopePolicy: ScopePolicy = {
  default: 'allow',
  entities: {
    orders: { read: [{ match: 'account_id', to: 'accountId' }] },
  },
};

// `orders` has no `delete` phase on purpose: under `default: 'deny'` the verb is refused.
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
    // `customers` grants update because its entry declares DO UPDATE, which is gated
    // like an update. `product_tags` uses DO NOTHING, which needs no update grant.
    customers: { insert: [], update: [] },
    product_tags: { insert: [] },
    // A $lookup reads its table under this policy: without a read phase here the
    // tag-by-name lookup is refused.
    tags: { read: [] },
    order_items: { insert: [] },
  },
};
