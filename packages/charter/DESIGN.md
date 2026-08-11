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

## Why actions are the right altitude

Every mainstream framework authorizes at the wrong level:

- **Routes** (Spring Security, NestJS guards) are addresses, not behaviors.
- **Components** (frontend RBAC wrappers) hide buttons; hiding is not a
  security model.
- **Rows** (RLS) cannot express "this user may not *initiate* a refund."

A Nova action is the complete contract in one serializable value: what you see
(`layout`), what you can do (`triggers`), what it touches (`endpoints`), what
it accepts (`input`). Granting at this altitude buys three properties nothing
else has:

- **Deny-by-nonexistence.** Navigation is push-by-id and the shell throws for
  unknown ids. A principal's catalog — the definitions their shell ever
  receives — *is* their application. Nothing outside it is reachable,
  renderable, or invokable.
- **One gate for humans and agents.** The same resolved catalog feeds the
  human's shell, the agent's tool policy (Cortex `policyGate`), and the
  server-function gate. One document governs every kind of principal.
- **Reviewable closure.** Because actions and charters are both data, "what can
  this role reach" is a computation, not an audit project. Run the audit
  machinery (nav targets, channels) over a role's catalog and its reachability
  is a verifiable, diffable fact.

---

## Core principles

### 1. Universe-blindness is the whole idea

The engine resolves globs over strings and never learns what a string means.
`resolveRole(charter, universe, role, section)` runs identical code whether the
universe is Nova action ids or vex `table.verb` leaves. This is not abstraction
for its own sake — it is what keeps access control *one* mechanism. A framework
that authorizes routes, components, and rows separately has three security
models and three places to be wrong. Charter has one algebra, applied per
section.

The consequence, enforced structurally: **the engine never manufactures a
universe.** It is always handed one. Each governed target exports its own
dialect (vex exports `SCOPE_VERBS` and `scopeGrants(tables)`; a shell's universe
is its action ids; moss's is its layout-variant ids), and the composing layer
derives the universe and passes it in. Charter imports nothing and is imported
by the resolution, never the reverse — so it has **zero dependencies**,
permanently, not incidentally.

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

## The three rings

The charter is one ring of three. Each ring assumes the ring above it is
compromised:

| Ring | Question | Enforced by |
|---|---|---|
| 1 — existence | Which actions are in your universe? | The charter (`actions`) → served catalog |
| 2 — shape | What does *your variant* of an action do? | Served layout variants (the `layouts` section → moss substitutes the variant's layout on the definition at shell build) |
| 3 — data | Which **verbs** on which entity? / Which **rows/columns**? | ACL: the charter (`data`) → a compiled Vex `ScopePolicy`. RLS: the policy's own row rules, locked fingerprints, closed mutation grammar |

Ring 3 has two halves this stack keeps apart. **ACL** — *may you write deals at
all* — is a verb question, and it is the charter's: the `data` section resolves
to `table.verb` grants that **compile to a Vex `ScopePolicy`** (which read/write
phases exist for you). **RLS** — *which rows* — is what a granted phase then does
(`match`/`set` rules), and the charter never touches it. Vex is the unforgeable
floor either way: an ungranted phase is simply absent from your policy, and
Vex's own default-deny refuses it; server-injected scope, identity stamping,
replay-only endpoints, and a mutation grammar that rejects `$scope` and blanket
writes stand under it. A malicious client that fabricates its own definitions
still cannot cross Vex.

**Ring 2 is the charter's `layouts` section.** A variant is a distinct id
selecting one action's layout; holding it swaps that layout in the served tree
(moss binds it on the definition per principal at shell build — see
`@niscorp/moss`). The base layout is the *floor* — the least-privileged holder's
shape — and variants **enrich upward** as grants, so `extends` composes them like
any capability and a forgotten grant fails closed (under-serves visibly). A
reducing variant is authored backwards: it forces deny-it-back in every richer
role and a forgotten deny over-serves silently. The charter still only
*selects*; what a variant *looks like* lives in the artifact.

So the charter does ring-1 existence, the ring-2 **variant** choice, and the
ring-3 **verb** decision; it never does ring-3 **row/column** work. And it never
*enforces* — it **compiles**: each consumer enforces its own native contract in
its own language, and the charter speaks that language at the boundary (see
**Compilers**).

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
  removes. There is no re-allow within a role — to permit an exception, deny
  more narrowly (corpus case 7).
- **Denies do not inherit.** `extends` unions *resolved sets*; a deny is local
  to the role that wrote it. A child may re-add what a parent denied — the
  *resolver* permits it (a legal composition), the *verifier* warns
  (`re-allow`), because it is usually a mistake but occasionally intended (F1).
- **Cycles and unknown references are errors**, surfaced by the resolver and
  collected by the verifier per section.
- **`extends` and `without` compose whole roles**, resolved in the current
  section. A role is a reusable bundle, not a flat glob list.

The resolved set is hashed. That hash is the catalog cache key and the version
token pushed to connected clients — grant changes propagate mid-session over the
socket, and revocation is the same push with a smaller set.

### Globs

One wildcard rule, no more: `*` matches any run of characters, including dots.
`crm.*` matches `crm.deal.form`. There is no `**`, no brace expansion, no regex.
The day a pattern cannot be expressed, the answer is a better id, not a richer
glob.

---

## Sections

A `Section` is `'actions' | 'data' | 'layouts'` — each a universe. `actions`
selects Nova action ids; `data` selects `table.verb` capabilities; `layouts`
selects layout-variant ids (ring 2). The sugar keeps the common role terse: a
bare `string[]` is an actions-only role, and top-level `allow`/`deny` are the
`actions` section (so an actions-only role never names a section). Explicit
`actions:`/`data:`/`layouts:` selections address each universe directly. Having
*both* the sugar and an explicit `actions:` on one role is the
`ambiguous-selection` error — resolution would silently drop one.

The `data` verb leaves mirror vex's phases: `read`, plus the three write ops
under the `write` *namespace* — `deals.read`, `deals.write.insert`,
`deals.write.update`, `deals.write.delete`. `write` itself is never an atom
(leaves-only); **the umbrella is a glob** — `deals.write.*` grants every write,
`*.write.delete` denies deletes across the board. The universe is derived from
the schema, never authored.

`extends`/`without` compose **every** section at once. Resolution, deny-wins,
and the verifier all run per section against the right universe — one matcher,
one resolver, one set of lints, reused. **Adding a governed surface is adding a
`Section` value, a universe, and a compiler in the *target* — never a grammar
change here.** The `layouts` section was exactly that: one enum value, moss
hands the universe in, moss compiles it to substituted layouts.

---

## Compilers — charter speaks each consumer's language

The charter never enforces; it **compiles**. Each governed library keeps its
own native, self-sufficient contract, enforced by its own machinery — Nova has
the action map (an absent id throws `UnknownActionError`), Vex has `ScopePolicy`
(an absent phase is default-denied), Cortex has `ToolPolicy`. None of them
imports the charter or knows it exists.

And the charter imports none of *them* — there is no dependency in either
direction ("no dependencies beats optional"). The charter's output is **string
sets**; each governed target exports its own *grants → native contract* intake,
in its own string dialect, and the composing server (`@niscorp/moss`) wires the
two:

| section | dialect (owned by the target) | intake | consumer |
|---|---|---|---|
| `actions` | action ids | the action map, filtered by ids | Nova's shell |
| `data` | `SCOPE_VERBS` leaves (`deals.write.insert`) | `createScopePolicy(grants, behaviors, scoping)` | Vex |
| `layouts` | variant ids | substitute the variant's layout on the definition | moss / Nova |
| (future) | tool names | a `ToolPolicy` constructor | Cortex's `policyGate` |

Each side stays pure and standalone: the charter is a string-set engine always
*handed* a universe; Vex without a charter is a hand-authored `ScopePolicy`;
Nova is a hand-authored action map. Grafting policy onto something new is
additive — the target exports its dialect and intake, the app passes the
universe in. The test for whether a thing is charter-governable is this stack's
house rule: **it is configured by declarative data, and absence means denial.**

The `data` intake is the exemplar and the reason it's trivial: a Vex policy
already fuses two things — which *phases* an entity has (present or absent — ACL,
which the charter owns) and what a phase *does* (its `match`/`set` rules — row
behavior, static and app-owned). So `resolved data grants → which phases exist`,
`behaviors table → what a phase does`. The viewer's mark-won dies because their
compiled policy has no `deals` write phase — not a gate anyone added, one the
charter never emitted.

There is a third input, and it fills the gap that fusion left. A policy answered
*which phases exist* (the charter's) and *what a phase does* (the behavior's) —
but a behavior was a property of the TABLE, so every role holding any grant on
it got the same reach. "The desk reads every booking; a member reads their own"
was unsayable, and the workaround was a second table carrying the tighter rule:
one fact in two places, kept level by a trigger, drifting the moment the trigger
was wrong.

Reach is a property of the ROLE, so `scoping` is a role-level name — resolved
like every other string here, meaningless to the engine, handed to the target,
which looks it up among the behaviors a table declares. One grant, two reaches:
`resolved data grants → which phases exist`, `behaviors[table][scoping] → what a
phase does, for this role`.

It is the one thing `extends` does NOT compose, and that asymmetry is load-
bearing rather than an omission. Every section accumulates upward because a desk
holding everything a member holds is right for actions and data. Reach inverts
it: a desk extends a member's *screens* and must not extend a member's *"only my
own rows"*, or the roster it exists to read filters to whoever is operating it.
A role's reach is its own answer or none.

Two roles naming different profiles is a PERSON, not a contradiction — somebody
who teaches at a studio and also trains there. So resolution is per role and the
compiled policies merge: the principal may do anything any role permits, each at
that role's reach. The refusal that stood here briefly ("incoherence, like two
granted variants of one action") was an analogy standing in for a case, and the
domain produced the counterexample within the hour.

The trusted path is a charter artifact too: the engine's *default* policy — what
direct callers (dev checks, an agent's query tool) run under — compiles from a
`system` role in the same document, never assigned to a human. There is no
policy in the app the charter does not own; even the engine's own floor is a
resolved, verified, diffable grant, and a verb the `system` role lacks dies for
the engine exactly as it does for a viewer.

---

## The closure audit

`verifyCharter` accepts an optional `ClosureAuditor` — an injected hook,
`(grantedIds, layoutIds?) => string[]`. The verifier resolves each role's
granted action set (and, when the app governs layouts, its granted variant ids)
and hands them to the auditor; the consumer that *owns* actions supplies the
check. Moss builds it from Nova's action audit and substitutes granted variants
first, so the closure sees each role's *effective* definitions — a role that can
reach a screen but not the screen it pushes to is a broken closure, and a
variant's push targets are audited for exactly the roles that hold it. Charter
never imports the auditor — the dependency points inward, so the package stays
universe-blind even about *what a coherent closure means*.

---

## Naming is the taxonomy

The charter has no tags, no categories, no metadata predicates. **The id
hierarchy is the taxonomy**, and globs traverse it. This is a deliberate bet:
developers already maintain exactly one taxonomy with care — the one they use to
find their own things. A parallel tag vocabulary would drift; the namespace
cannot, because it is structural.

Conventions this implies (scaffolding defaults, not grammar):

- Ids shaped `area.entity.variant`: `crm.deal.form`, `chrome.sidebar`,
  `finance.invoices`.
- **Ids are leaves; namespaces are never actions.** If `crm.deals` exists,
  nothing is named bare `crm`. Removes the `crm` vs `crm.*` off-by-one.
- Variants are distinct ids: `crm.deal` and `crm.deal.view` are two actions. The
  charter selects; it never shapes.
- A rename is a permissions change. That is a feature: the verifier diffs it.

---

## The corpus

The grammar is only as good as the cases it survives. The instructive ones,
typical first, then the ones that break other systems.

- **Anonymous baseline** — `"public": ["auth.login", "docs.*"]`.
- **The ladder** — `viewer` → `editor extends viewer allow crm.*` → `admin
  extends editor allow settings.* charter.*`. Administering permissions is
  itself just actions (F6).
- **Superadmin** — `"root": ["*"]`.
- **Kiosk** — `"warehouse-scanner": ["inventory.scan", "inventory.lookup"]`. This
  terminal's *entire application* is two actions. Nothing else to attack.
- **Two hats** — `{ "extends": ["sales", "manager"] }`. Sets union; no diamond
  problem — a granted action is granted, nothing to override.
- **Everything-except** — `{ "extends": ["sales"], "deny": ["*.delete",
  "*.export", "finance.*"] }`. The case that kills enumerated-list systems, in
  one line.
- **Exception-to-the-exception** — interns may delete nothing *except their own
  drafts*: `"deny": ["crm.deal.delete", ...], "allow": ["drafts.delete"]`.
  **Awkward on purpose.** You cannot `deny: ["*.delete"]` then claw back
  `drafts.delete` — deny wins, no re-allow within a role. You deny *narrowly*.
  The cost buys charters that never require simulating precedence in your head.
- **An agent narrower than its human** — `"agent-unsafe": { "allow": ["*.form",
  "*.delete", "finance.*"] }`, worn subtractively: `"ray": { "extends":
  ["sales"], "without": ["agent-unsafe"] }`. The AI-governance story is one line
  of the grammar that does everything else.
- **Plans / tiers / entitlements** — a `pro-only` role, `free-seat` wears it via
  `without`, `pro-seat` extends without it. A downgrade is swapping one
  assignment row. RBAC, feature flags, and billing are the same mechanism.
- **This one guy** — `"usr_017": { "extends": ["sales"], "deny": ["crm.export"]
  }`. A principal-specific role is just a role.
- **Time-boxed / break-glass / suspension — not charter.** These are
  **assignment rows** (`{ principal, role, expires, grantedBy, reason }`).
  Break-glass is two ordinary actions (request/approve) whose effect writes a
  row with an expiry; the catalog service watches assignments and pushes the new
  catalog. Suspension is deleting rows, or assigning the empty catalog — a valid
  application: a lock screen. The charter says what roles *are*; a table says who
  *wears* them, when.
- **A new action ships** — `crm.quotes` is published; every role matching `crm.*`
  gains it, pushed over the socket. Feature and footgun in one: the guard is not
  grammar but the **publish-time diff** — *"crm.quotes → gained by: sales,
  intern, ray."* If that line surprises anyone, the naming was wrong.
- **Same action, different depth per role** — `"support": ["crm.deal.view"]` vs
  `"sales": ["crm.deal", "crm.deal.view"]`. Clean *because* variants are distinct
  ids.
- **"Readonly for reps" / "no margin field" — ring 2.** A reduced view is a
  variant (a distinct layout, granted via the `layouts` section); field-level
  hiding is a patched variant with Prism redaction on the response transform.
  Shape lives in the artifact, not the grant.
- **"Needs manager approval" — not charter.** Approval is part of what the action
  *is* — a fragment composed onto it (the `confirm-delete` pattern). Reps-need,
  managers-don't → two variants, granted respectively.
- **"Only their OWN deals" — not charter, loudly.** Row-level is Vex scope policy
  (`match: owner_id → userId`). The charter decides whether the verb exists;
  Vex decides which rows. Mixing these makes an ACL unreviewable.
- **A global invariant** — "nobody but finance touches `finance.*`" is awkward
  per-role (deny in every role forever, one forgotten role breaks it). It is
  policy *about* the charter and belongs to the verifier as an assertion
  (`{ "only": ["finance", "root"], "may-match": "finance.*" }`) — CI lint, not a
  runtime boundary.

---

## Known flaws, found on purpose

The design was red-teamed. None of the flaws required new grammar; all moved
work to the verifier.

- **F1 — Deny does not survive `extends`.** A child re-allows what a parent
  denied. The algebra is consistent (a parent role is just a set) and viral
  denies would break legitimate composition — but it dents "deny always wins"
  (true only within a role). *Fix:* visibility. The verifier flags every
  re-allow of an ancestor's deny, in every diff.
- **F2 — Subtractive roles are loaded guns if assigned.** `agent-unsafe` is a
  positive list that only subtracts because `without` uses it that way. Assign
  it by accident and the principal gains everything in it. *Fix:* the assignment
  diff renders in concrete actions, and the verifier lints any role referenced
  in `without` that is also assigned.
- **F3 — A typo'd deny fails silent.** `"deny": ["crm.deal.delte"]` matches
  nothing, forever. *Fix:* asymmetric linting — dead deny is an error, dead
  allow a warning.
- **F4 — `crm` vs `crm.*`.** Solved by convention: ids are leaves, namespaces
  are never actions. Verifier enforces (`leaves-only`).
- **F5 — Orphan actions.** An action matched by no role is deployed but
  unreachable — deny-by-default working, but usually a mistake. Verifier reports
  orphans at publish (layout variants too).
- **F6 — The charter can escalate itself.** Whoever holds `charter.edit` can
  grant themselves root. The runtime gate is the charter itself: nobody holds
  `charter.*` unless the charter grants it, and edits execute as
  server-authoritative actions — audited, Vex-logged, approval-fragmented where
  wanted. The assertion pinning the meta-loop (only `root` may match `charter.*`)
  is CI lint: a tripwire, not the enforcement.
- **F7 — Tenant overlays.** Per-tenant roles layer on a base charter with one
  rule: overlays may add roles and extend base roles, **never redefine a base
  name**. Shadowing `admin` per-tenant is how SaaS horror stories start.
- **F8 — Versions.** Charters name logical ids only. Which *version* of
  `crm.deal.form` a catalog serves is the artifact library's published-pointer
  concern. A charter that needs to pin versions is a symptom, not a feature.

---

## The verifier is the other half

The grammar stopped moving and every flaw found its fix in tooling. That is the
intended shape. The charter stays something a non-programmer reads aloud; the
verifier carries the opinions:

- resolves every role at boot / in CI — *if it boots, it's coherent*
- **dead deny = error**, dead allow = warning, orphan actions and variants
  reported
- flags re-allows of an ancestor's deny (F1)
- flags roles referenced in `without` that are also assigned (F2)
- enforces id conventions (leaves only) and overlay rules (no shadowing)
- checks `assert` invariants (F6)
- runs the reachability closure per role (nav targets, channels) and reports
  dead emits and unreachable grants
- and above all: **the diff renders in concrete actions, not globs** — "this
  change: intern +`crm.import`, −`confirm-delete`; ray unchanged." A human
  approves *that*. This is only possible because the permissions are closed data
  over closed artifacts.

---

## What it refuses to do

For every temptation, the forwarding address:

| Temptation | Home |
|---|---|
| Row filtering ("only my deals") | The Vex policy's own `match` rules — a behavior of a granted phase, not the charter |
| Column shaping ("no margin field") | Patched variant + Prism redaction (ring 2) |
| Approval / confirmation flows | Fragments composed onto the action (ring 2) |
| Time-boxed / conditional access | Assignment rows (a table) |
| Break-glass elevation | Two actions + an assignment row |
| Feature flags, plans, entitlements | Roles + `without` |
| Cross-role invariants | Verifier `assert` |
| Version pinning | Artifact library pointers |
| Tags / metadata predicates | The id namespace |
| Grant-time shaping (`apply` a patch in a selector) | Refused — mint a variant id (ring 2) |
| Enforce, store, transport, or manufacture a universe | Not the package's job — resolution and verification only |
| Grow the glob | One `*`. A richer pattern language is a worse id scheme in disguise |

The charter maps names to selections. It decides *whether the verb exists in
your world*; everything about *which rows*, *which columns*, or *what a variant
looks like* has a home that already exists.

---

## Boundaries

Charter is consumed by the composing server (`@niscorp/moss`), which derives the
universes (action ids from the manifest, `table.verb` leaves from vex's
introspected schema, variant ids from the manifest's `layouts`), calls
`resolvePrincipal` per login, refuses to boot on `verifyCharter` errors, and
hands the resolved sets to the enforcers. Charter knows about none of that — it
is the algebra at the center, and nothing more. See [DOCS.md](DOCS.md) for the
API.
