// Scope is server-side, LLM-invisible access control, applied to the resolved
// query/mutation AFTER it is authored — so a generated or injected DSL can never
// reference, dodge, or forge it. There are two roles, named for the SQL they
// produce:
//   • match — RLS: the row's column must equal a scope value (a WHERE filter,
//     and on INSERT the column is pinned to that value so you can't write
//     outside your boundary).
//   • set   — identity: on INSERT the engine fills the column from a scope value
//     (a stamp). Insert-only; it doesn't restrict reads or modifies.

// Caller runtime values, injected at execute via options.scope, keyed by name
// (e.g. { userId, accountId }). A rule's `to` names one of these keys.
export type ScopeValues = Record<string, unknown>;

// RLS filter: `<entity>.<match>` must equal the `to` scope value.
export type ScopeMatch = { match: string; to: string };

// Identity stamp: on INSERT, `<set>` is filled from the `to` scope value.
export type ScopeSet = { set: string; to: string };

export type ScopeRule = ScopeMatch | ScopeSet;

export type ScopeEntityRule =
  | { public: true } // fully open (read + write, no rules)
  | { deny: true } // fully closed
  | {
      // Reads (SELECT): each match becomes a WHERE filter. Match only — there is
      // nothing to stamp on a read.
      read?: ScopeMatch[];
      // Writes: a `match` filters UPDATE/DELETE and pins the column on INSERT; a
      // `set` stamps the column on INSERT.
      write?: ScopeRule[];
    };

export type ScopePolicy = {
  // Fallback for an entity that isn't listed, and for a listed entity's absent
  // phase: 'allow' = unrestricted, 'deny' = no access.
  default: 'allow' | 'deny';
  entities: Record<string, ScopeEntityRule>;
};
