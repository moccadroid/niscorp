// The charter grammar — CHARTER.md, verbatim. A role is either a bare list
// of globs (sugar for { allow }) or an object with at most four keys: the
// complete 2×2 of add/subtract × inline/by-reference. Arrays contain only
// plain strings; there are no sigils, no precedence rules, no conditions.
export type RoleDef =
  | string[]
  | {
      allow?: string[];
      extends?: string[];
      deny?: string[];
      without?: string[];
    };

// A charter maps role names to selections of actions.
export type Charter = Record<string, RoleDef>;
