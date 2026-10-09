// THE MEMO KEY every per-principal resolution (../manifest, ../data) actually
// depends on.
//
// `resolvePolicy`, `resolveVariants` and `resolvePolicyAtReach` read the
// principal ONLY to reach its roles; `resolveCatalog` reads its roles and its
// installed integrations. Nothing reads the principal itself. Keying the memos
// by principal therefore stored one entry per person for an answer that has as
// many distinct values as there are (combination × install-set) pairs — about
// ten in a real deployment, and unbounded in a map that is never evicted.
// ONE SPELLING of the key, so the identity path and the older seams cannot
// disagree about what counts as the same principal-shape.
//
// NUL separators, the same reason `policyAtReach` uses one: no id can contain
// it, so `['a','b']` cannot spell itself the same way as `['a b']`.
//
// `undefined` is "every registered integration is live" and the empty list is
// "none are" — different answers, and a key that conflated them would serve one
// tenant's catalog to the other.
export const memoKey = (roles: readonly string[], installed: readonly string[] | undefined): string =>
  `${[...roles].sort().join('\0')}\0\0${installed === undefined ? '*' : [...installed].sort().join('\0')}`;
