# @niscorp/charter

## 0.2.0

### Minor Changes

- 092b5f1: BREAKING — approved by moccadroid (owner), 2026-11-22: a charter that writes a string where a list belongs (`allow: "crm.deal.view*"`) and relied on it granting every id writes the patterns it means as a list.

  A string where a charter expects a list (`allow: "crm.deal.view*"`) is read as a list of that one pattern instead of one pattern per character, so it no longer grants every id through a `*`. `verifyCharter` reports keys it does not read (a misspelt `denny` or `Deny`) and such strings as `shape` warnings. Any other value that is not a list of strings no longer crashes the verifier: it grants nothing (a warning), and in `deny` or `without`, or as a whole role that is `null`, it is a `shape` error. A `scoping` that is not a string is still handed on as written, so the role reaches no rows, and is now a `shape` warning. `*` now matches across line breaks in an id.

- 74a9a7a: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host resolves, without `verifyCharter`, a role that has both an `actions:` section and a top-level `deny`, and relied on that `deny` being dropped.

  A role with both an `actions:` section and a top-level `deny` (`{ actions: ['crm.*'], deny: ['crm.deal.delete'] }`) now takes away what the top-level `deny` names when it is resolved, instead of granting the whole section, and a role that extends it (`c: { extends: ['p'] }`) no longer gets `crm.deal.delete` from it either. The top-level `allow` beside an `actions:` section still grants nothing. `verifyCharter` refuses such a role as before (`ambiguous-selection`), so under moss nothing changes; it now also checks that top-level `deny` like any other, so a charter already refused can report more lines for it: `dead-deny` when it matches nothing (`{ r: { actions: ['crm.*'], deny: ['hr.nothing'] } }`), `orphan` for an action it leaves no role granting, and a re-allow warning for a child that grants back what it takes away.

### Patch Changes

- c9158e2: A role named in `extends` or `without` by a name every object answers to (`constructor`, `toString`, `hasOwnProperty`, `__proto__`) that the charter does not define resolves as an empty role, and `verifyCharter` says so as a `shape` warning, as it does for a misspelt key.

  A glob with many stars (`*a*a*a*a*a*a*a*a*a*a*b`) against a long id answers in milliseconds instead of seconds: globs are matched without a regular expression, with the same answers.

  `RoleClosure` gains an optional `functions`: the functions a role is granted, listed in `verifyCharter`'s `perRole` when the functions universe is handed in. Without that universe the field is absent.

## 0.1.5

### Patch Changes

- febd8b7: The docs cover the `functions` section: what it selects, which checks run on it (no leaves-only), and that moss enforces it.

  **What to change:** nothing. Documentation only.

## 0.1.4

### Patch Changes

- 9e6a7c3: The charter decides which of an app's functions a principal may call. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-14: give every role of the charter a `functions` part, the functions its actions call, or `functions: ['*']` to keep calling all of them; a role written as a list (`member: ['home', 'settings']`) becomes `member: { actions: ['home', 'settings'], functions: [...] }`.
  - **A shell holds only the functions its principal's roles grant** (`functions`, beside `actions`, `data` and `layouts`, with the same globs, `extends` and `deny`). A role with no `functions` may call none. Before, every shell held every function. A living shell follows the roles an adopt answers, as its actions do.
  - **The boot is refused, with the list of what to grant**, where a role on its own, a combination people wear, or `public` holds an action (or the shells ship a fragment) that calls a function its grants miss: `"member" hold "chrome.topbar", which calls "auth.leave": their functions do not grant it`. A name with a template in it is decided when it is called.
  - **`'*'` is said at boot**: `role "member" allows every function ('*'): the generated actions of the people who hold it, or a role that extends it, may call any it does not deny`.
  - **A grant that names no function** (a typo) is said at the first shell a process builds, with a deny that matches nothing and a function no role grants: the names of the app's functions are known once `functions(session)` has run, and are read as that first session's.
  - **A generated action or fragment may call a function its owner's roles grant**, named written out; one they do not grant is refused when it is saved and left out when a shell is built. `session.functions()` lists the functions a session may call, `{ id, description? }`, for the model that writes one.
  - `@niscorp/charter` has the `functions` section, and `verifyCharter` checks it where a `functions` universe is handed in.

  For whoever upgrades an app, person or agent: boot it. The refusal lists, per role combination, each function an action calls that the charter does not grant. Add those names to the `functions` of the role that holds the action, or `['*']` to the roles whose people may call everything. This is the app's permissions table: write it deliberately, and do not generate it.

## 0.1.3

### Patch Changes

- de2a757: DOCS.md no longer tells an app to import `auditClosure` from `@niscorp/moss`. Moss stops exporting it (see the moss changeset): it supplies its own closure auditor whenever it verifies an app, at boot and in `verifyApp(app, grants)`. The `ClosureAuditor` section says so, and the usage pattern calls `verifyCharter` without an auditor, which is what a consumer with no auditor of its own does. No code changed.

  **What to change:** nothing.

## 0.1.2

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

## 0.1.1

### Patch Changes

- b67a125: Documentation only: each package's README, reference and design docs checked against its source and corrected — install lines and peers, signatures, defaults, status codes, licenses (loom, signal: Apache-2.0), and API that existed but was not documented.
