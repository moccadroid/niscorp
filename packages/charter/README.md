# @niscorp/charter

A universe-blind policy engine. Roles map glob selections over **opaque string universes**; the engine resolves them to a concrete id set per principal, and a verifier refuses an incoherent charter before it ships. Zero dependencies, by design.

The engine never learns what a string means. You hand it a universe of ids (Nova action ids, `table.verb` capabilities, anything), a charter that selects over them with globs, and it returns the resolved set. The same code resolves any domain — access control is one algebra, not one per resource kind.

## Install

```bash
pnpm add @niscorp/charter
```

No peer dependencies. It imports nothing and manufactures no universe of its own — each governed target exports its own dialect and the composer hands the universe in.

## Quick Example

```typescript
import { resolvePrincipal, verifyCharter } from '@niscorp/charter';

// The charter — role names → selections. `extends` composes whole roles;
// globs select within a universe; deny wins.
const charter = {
  viewer: ['crm.contacts', 'crm.*.view'],
  sales: { extends: ['viewer'], allow: ['crm.*'], deny: ['crm.*.delete'] },
  admin: { extends: ['sales'], allow: ['crm.*.delete', 'settings'] },
};

// The universe of ids that actually exist — the app derives this
// (here, the action ids it ships). The engine never invents it.
const actions = ['crm.contacts', 'crm.contact.view', 'crm.deal.view', 'crm.deal.delete', 'settings'];

// What a principal wearing ['sales'] may reach:
resolvePrincipal(charter, actions, ['sales']);
// Set { 'crm.contacts', 'crm.contact.view', 'crm.deal.view' }
//   crm.* matched everything; deny crm.*.delete removed the delete.

// Refuse incoherence at boot — a dead deny, an ambiguous selection,
// an unreachable action all surface here.
const report = verifyCharter(charter, { actions, data: [] });
if (report.errors.length > 0) throw new Error('charter is incoherent');
```

## What it is

- **Universe-blind.** `resolvePrincipal(charter, universe, roles, section)` runs the same resolution against any universe. `actions` selects Nova action ids; `data` selects `table.verb` capabilities (the vex-policy dialect); `layouts` selects layout-variant ids (ring 2 — moss's dialect: which variant of an action's layout a principal is served). Adding a governed domain is adding a universe, never new grammar.
- **A small algebra.** `resolved(role) = (∪ extends ∪ match(allow)) − match(deny) − ∪ without`. Order-independent, deny wins within a role, denies don't inherit. Roles compose whole roles; each section resolves independently.
- **One glob rule.** `*` matches any run of characters including dots — `crm.*` matches `crm.deal.form`. No `**`, no braces, no regex. When a pattern can't be expressed, the fix is a better id.
- **A verifier that refuses.** `verifyCharter` runs the opinions the grammar deliberately omits: a dead deny is an **error** (a typo'd deny fails silent, and silent means unprotected); a dead allow is a warning; ambiguous selections, namespace-as-action, orphan actions, re-allowed ancestor denies all surface. "If it boots, it's coherent."

## What it is not

It does not enforce, store documents, or know about HTTP, databases, or your app. The charter and the assignment rows are the **app's** artifacts. Enforcement is the governed target's job — vex compiles the resolved `data` set into a scope policy; a shell mounts only the resolved `actions`. Charter resolves and refuses; it never runs at request time.

See [DESIGN.md](DESIGN.md) for the thesis and [DOCS.md](DOCS.md) for the full API.
