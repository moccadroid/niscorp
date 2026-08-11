// The charter grammar. A role grants across one or more SECTIONS, each a
// selection in that section's own universe of ids — the engine is universe-
// blind, so a section is just "which universe do these globs resolve in".
// `actions` selects Nova action ids; `data` selects `table.verb` capabilities
// (the vex-policy universe); `layouts` selects layout-variant ids (ring 2 —
// which VARIANT of an action's layout a principal holds; holding none means
// the base). Adding a section is adding a universe + a compiler, never new
// grammar.
export type Section = 'actions' | 'data' | 'layouts';

// Within a section: a bare glob list (sugar for { allow }) or add/subtract.
// Same 2×2 atoms as the role level, one universe down.
export type Selection = string[] | { allow?: string[]; deny?: string[] };

// A role: role-level composition (`extends`/`without` reference whole roles
// and compose EACH section), plus a selection per section. Sugar keeps the
// common case terse: a bare array is an actions-only role, and top-level
// `allow`/`deny` are the `actions` section (so a role that only grants
// actions never needs to name the section).
export type RoleDef =
  | string[]
  | {
      extends?: string[];
      without?: string[];
      allow?: string[]; // sugar → actions.allow
      deny?: string[]; // sugar → actions.deny
      actions?: Selection;
      data?: Selection;
      layouts?: Selection;

      // HOW FAR THIS ROLE REACHES — a name the governed target resolves, the
      // same way it resolves the strings in every section above. The charter
      // does not know what it means; it only knows which role said it.
      //
      // Deliberately NOT composed by `extends`, and that is the whole point.
      // Every section accumulates upward — a desk holding everything a member
      // holds is exactly right for actions and data. Reach is the opposite: a
      // desk extends a member's SCREENS but must not extend a member's
      // "only my own rows", or the roster it exists to read would filter to
      // the one person operating it.
      //
      // So a role's reach is its own answer or none. Inheriting it would be
      // silently wrong in the direction that matters.
      //
      // A principal wearing SEVERAL roles that each name a profile is a person,
      // not a conflict — an instructor who trains at the studio they teach at.
      // Resolve one role at a time and merge the compiled policies; there is
      // nothing here for the charter to arbitrate.
      scoping?: string;
    };

export type Charter = Record<string, RoleDef>;
