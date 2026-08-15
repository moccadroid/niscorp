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

// RLS filter: `<entity>.<match>` must equal the `to` scope value — or, in the
// set-valued form, must be ONE OF the `in` scope value.
//
// THE SET IS FOR READS. A reach that covers several rows is a real concept —
// "mine, and the people I am answerable for" — and the scalar form cannot say
// it. What the set deliberately CANNOT do is pin a write: a `match` on an
// INSERT writes the column (engine.ts), and a set has no single value to
// write. That is not a gap to fill later; it is the property that keeps a
// write's subject unforgeable. The mutation engine throws rather than
// guessing, so a set-valued write rule is unauthorable rather than merely
// discouraged.
//
// Fail-closed comes from SQL rather than from a guard here: the set compiles
// to `col = ANY($n)`, an absent scope value binds NULL (`= ANY(NULL)` is NULL,
// so the row drops) and an empty one binds `{}` (false). Neither can be
// forgotten, because neither was written.
export type ScopeMatchOne = { match: string; to: string };
export type ScopeMatchAny = { match: string; in: string };
export type ScopeMatch = ScopeMatchOne | ScopeMatchAny;

/** The set-valued form, told apart by its key — `to` and `in` never coexist. */
export const isSetMatch = (m: ScopeMatch): m is ScopeMatchAny => 'in' in m;

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
