# Charter — Design Document

## Purpose

Access control that decides **which parts of an application exist** for a
principal, rather than wrapping the application in checks. In this stack an
`ActionDefinition` is a complete behavioral unit and pure data, so a granted
catalog *is* the application. An ungranted action is not hidden or disabled —
it is absent. There is no `if (canAccess)` to forget.

**One sentence:** roles select globs over opaque string universes; the engine
resolves them to a concrete set per principal, and the verifier refuses an
incoherent charter before it ships.

The companion document [CHARTER.md](../../CHARTER.md) is the design conversation
— why actions are the right altitude to authorize at, and where the model gets
awkward. This document pins what the *package* is.

---

## Core principles

### 1. Universe-blindness is the whole idea

The engine resolves globs over strings and never learns what a string means.
`resolveRole(charter, universe, role, section)` runs identical code whether the
universe is Nova action ids or vex `table.verb` leaves. This is not an
abstraction for its own sake — it is what keeps access control *one* mechanism.
A framework that authorizes routes, components, and rows separately has three
security models and three places to be wrong. Charter has one algebra, applied
per section.

The consequence, enforced structurally: **the engine never manufactures a
universe.** It is always handed one. Each governed target exports its own
dialect (vex exports `SCOPE_VERBS` and `scopeGrants(tables)`; a shell's universe
is its action ids), and the composing layer derives the universe and passes it
in. Charter imports nothing and is imported by the resolution, never the
reverse — so it has **zero dependencies**, permanently, not incidentally.

### 2. The grammar stays small; the opinions live in the verifier

The grammar is deliberately thin: roles, `extends`/`without` (compose whole
roles), and a `Selection` per section (`allow`/`deny` globs, with sugar for the
common cases). That is all resolution needs.

Everything judgmental — what counts as a mistake — lives in `verifyCharter`,
run at boot/CI, not at request time. Separating the two means the hot path
(resolution) is a pure set operation with no policy baked in, and the opinions
are auditable in one place. The rule is: **if it boots, it's coherent.** A
charter that resolves cleanly and passes the verifier cannot silently
mis-grant.

### 3. Severities are asymmetric on purpose

A **dead deny** — a deny glob matching nothing in the universe — is an *error*.
A typo'd deny fails silent, and a silent deny means something is unprotected
that the author believed was protected. A **dead allow** is only a *warning*: it
grants nothing, so it is noise, not danger. The verifier's severity is chosen by
"what happens if the author is wrong here," never by symmetry.

### 4. The documents are the app's, not the package's

The charter and the assignment rows (`principal → roles`) are **artifacts the
application authors** — one day rows in an artifact library, versioned and
diffable. Charter is the engine that resolves and verifies them; it ships no
document, no storage, no identity. This keeps the package a pure function and
lets the app own its policy as data.

---

## The algebra

Resolution, per section, verbatim:

```
resolved(role) = (∪ resolved(extends) ∪ match(allow))
                 − match(deny)
                 − ∪ resolved(without)
```

Properties, all deliberate:

- **Order-independent.** Every subtraction is set-minus; there is no
  first-match precedence to reason about.
- **Deny wins within a role.** `allow` then `deny` in the same role: the deny
  removes.
- **Denies do not inherit.** A child may re-add what a parent denied — the
  *resolver* permits it (it is a legal composition), the *verifier* warns
  (`re-allow`), because it is usually a mistake but occasionally intended.
- **Cycles and unknown references are errors**, surfaced by the resolver and
  collected by the verifier per section.
- **`extends` and `without` compose whole roles**, resolved in the current
  section. A role is a reusable bundle, not a flat glob list.

## Sections

A `Section` is `'actions' | 'data'` today — each a universe. `actions` selects
Nova action ids; `data` selects `table.verb` capabilities. The sugar keeps the
common role terse: a bare `string[]` is an actions-only role, and top-level
`allow`/`deny` are the `actions` section (so an actions-only role never names a
section). Explicit `actions:`/`data:` selections address each universe
directly. Having *both* the sugar and an explicit `actions:` on one role is the
`ambiguous-selection` error — resolution would silently drop one.

Adding a third governed domain is adding a `Section` value, a universe, and a
compiler in the *target* — never a grammar change here.

## The closure audit

`verifyCharter` accepts an optional `ClosureAuditor` — an injected hook,
`(grantedIds) => string[]`. The verifier resolves each role's granted action
set and hands it to the auditor; the consumer that *owns* actions supplies the
check (Nova's action audit: a role that can reach a screen but not the screen
it pushes to is a broken closure). Charter never imports the auditor — the
dependency points inward, so the package stays universe-blind even about *what
a coherent closure means*.

---

## What it refuses to do

- **Enforce.** Resolution and verification only. A resolved set is compiled and
  enforced by the governed target (vex's scope policy, a shell's mount set).
- **Store or transport.** No documents, no identity, no HTTP, no database.
- **Manufacture a universe.** Always handed in.
- **Grow the glob.** One `*`. A richer pattern language is a worse id scheme in
  disguise.

## Boundaries

Charter is consumed by the composing server (in this stack, `@niscorp/moss`),
which derives the universes (action ids from the manifest, `table.verb` leaves
from vex's introspected schema), calls `resolvePrincipal` per login, refuses to
boot on `verifyCharter` errors, and hands the resolved sets to the enforcers.
Charter knows about none of that — it is the algebra at the center, and nothing
more.
