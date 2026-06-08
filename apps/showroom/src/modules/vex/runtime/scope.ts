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
    orders: { field: 'account_id', source: 'accountId' },
  },
};
