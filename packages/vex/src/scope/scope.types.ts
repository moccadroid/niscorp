export type ScopeValues = Record<string, unknown>;

// `match` is a column; `to` and `in` name scope keys. On INSERT a match pins
// the column to the scope value, which the set-valued `in` form cannot do: the
// engine throws.
export type ScopeMatchOne = { match: string; to: string };
export type ScopeMatchAny = { match: string; in: string };
export type ScopeMatch = ScopeMatchOne | ScopeMatchAny;

export const isSetMatch = (m: ScopeMatch): m is ScopeMatchAny => 'in' in m;

export type ScopeSet = { set: string; to: string };

export type ScopeRule = ScopeMatch | ScopeSet;

export type ScopeEntityRule =
  | { public: true } // read and write, with no rules
  | { deny: true }
  | {
      read?: ScopeMatch[];
      // A phase's presence grants its op, even with no rules. `write` grants all
      // three writes, and its rules apply to each on top of the op's own.
      write?: ScopeRule[];
      insert?: ScopeRule[];
      update?: ScopeRule[];
      delete?: ScopeMatch[];
    };

export type ScopePolicy = {
  // For an entity that is not listed, and for a listed entity's absent phase.
  default: 'allow' | 'deny';
  entities: Record<string, ScopeEntityRule>;
};
