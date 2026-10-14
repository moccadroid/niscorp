export type Section = 'actions' | 'data' | 'layouts' | 'functions';

export type Selection = string[] | { allow?: string[]; deny?: string[] };

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
      // The app's functions a role may call. With none, it may call none.
      functions?: Selection;

      // A name the governed target resolves. Not inherited through `extends`:
      // a desk that extends a member must not take on the member's "only my own
      // rows", or the roster the desk reads would filter to whoever operates it.
      scoping?: string;
    };

export type Charter = Record<string, RoleDef>;
