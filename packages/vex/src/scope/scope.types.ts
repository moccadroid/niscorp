// Scope is server-side, LLM-invisible access control, applied to the resolved
// query/mutation AFTER it is authored — so a generated or injected DSL can never
// reference, dodge, or forge it. There are two roles, named for the SQL they
// produce:
//   • match — RLS: the row's column must equal a scope value (a WHERE filter,
//     and on INSERT the column is pinned to that value so you can't write
//     outside your boundary).
//   • set   — identity: the engine writes the column from a scope value on
//     EVERY column-writing op — INSERT values and UPDATE set alike (`write`
//     means every write; delete writes no columns, so it is structurally
//     exempt). It doesn't touch reads.

// Caller runtime values, injected at execute via options.scope, keyed by name
// (e.g. { userId, accountId }). A rule's `to` names one of these keys.
export type ScopeValues = Record<string, unknown>;

// RLS filter: `<entity>.<match>` must equal the `to` scope value.
export type ScopeMatch = { match: string; to: string };

// Identity write: `<set>` is filled from the `to` scope value on every
// column-writing mutation (INSERT and UPDATE).
export type ScopeSet = { set: string; to: string };

export type ScopeRule = ScopeMatch | ScopeSet;

export type ScopeEntityRule =
  | { public: true } // fully open (read + write, no rules)
  | { deny: true } // fully closed
  | {
      // Reads (SELECT): each match becomes a WHERE filter. Match only — there is
      // nothing to stamp on a read.
      read?: ScopeMatch[];
      // Writes. `write` is the UMBRELLA: its presence grants insert, update
      // and delete, and its rules apply to every one of them. The specific
      // phases refine it: their presence grants just that op, and their rules
      // apply ON TOP of the umbrella's. An op is allowed iff its specific
      // phase or `write` exists. Rule mechanics per op: a `match` filters
      // UPDATE/DELETE and pins the column on INSERT; a `set` writes the
      // column on INSERT and UPDATE (delete writes no columns, so `delete`
      // is match-only at the type level).
      write?: ScopeRule[];
      insert?: ScopeRule[];
      update?: ScopeRule[];
      delete?: ScopeMatch[];
    };

export type ScopePolicy = {
  // Fallback for an entity that isn't listed, and for a listed entity's absent
  // phase: 'allow' = unrestricted, 'deny' = no access.
  default: 'allow' | 'deny';
  entities: Record<string, ScopeEntityRule>;
};
