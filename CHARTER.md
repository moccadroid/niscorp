# The Charter

> Working draft — a foundation document to argue about. Nothing here is built.
> It distills the access-control design discussion into one proposal: what a
> charter is, its grammar, its semantics, what it refuses to do, and where it
> gets awkward. Argue with the **Open questions** at the bottom.

A **charter** is the document that says which Nova actions exist for whom.

That sentence is deliberately small. In this stack an `ActionDefinition` is a
complete behavioral unit — layout, triggers, endpoints, input contract — and it
is pure data. So access control does not need to *wrap* the application in
checks; it can decide **which parts of the application exist in a given user's
universe**. An action you are not granted is not hidden or disabled. It is
absent. There is no `if (canAccess)` to forget.

The charter is the constitution of that mechanism: a small, reviewable JSON
document mapping role names to selections of actions.

---

## Why actions are the right unit

Every mainstream framework authorizes at the wrong altitude:

- **Routes** (Spring Security, NestJS guards) are addresses, not behaviors.
- **Components** (frontend RBAC wrappers) hide buttons; they are not a security
  model.
- **Rows** (RLS) cannot express "this user may not *initiate* a refund."

A Nova action is the complete contract in one serializable value: what you see
(`layout`), what you can do (`triggers`), what it touches (`endpoints`), what
it accepts (`input`). Granting at this altitude gives properties nothing else
has:

**Deny-by-nonexistence.** Navigation is push-by-id and the shell throws for
unknown ids. A principal's catalog — the set of definitions their shell ever
receives — *is* their application. Nothing outside it is reachable, renderable,
or invokable.

**One gate for humans and agents.** The same resolved catalog feeds the human's
shell, the agent's tool policy (Cortex `policyGate`), and the
server-function gate. One document governs every kind of principal.

**Reviewable closure.** Because actions and charters are both data, "what can
this role reach" is a computation, not an audit project. The audit machinery
already walks nav targets and channels; run it over a role's catalog and the
reachability of that role is a verifiable, diffable fact.

---

## The three rings (context, not charter)

The charter is one ring of three. Each ring assumes the ring above it is
compromised:

| Ring | Question | Enforced by |
|---|---|---|
| 1 — existence | Which actions are in your universe? | The charter (`actions`) → served catalog |
| 2 — shape | What does *your variant* of an action do? | Authored/derived variants (patches, Prism redaction, fragments) |
| 3 — data | Which **verbs** on which entity? / Which **rows/columns**? | ACL: the charter (`data`) → a compiled Vex ScopePolicy. RLS: the policy's own row rules, locked fingerprints, closed mutation grammar |

Ring 3 has two halves that this stack keeps apart. **ACL** — *may you write
deals at all* — is a verb question, and it is the charter's: the `data`
section resolves to a set of `table.verb` grants that **compile to a Vex
`ScopePolicy`** (which read/write phases exist for you). **RLS** — *which
rows* — is what a granted phase then does (`match`/`set` rules), and the
charter never touches it. Vex is the unforgeable floor either way: an
ungranted phase is simply absent from your policy, and Vex's own default-deny
refuses it; server-injected scope, identity stamping, replay-only endpoints,
and a mutation grammar that rejects `$scope` and blanket writes stand under
it. A malicious client that fabricates its own definitions still cannot cross
Vex.

The charter does ring-1 existence and the ring-3 **verb** decision; it never
does ring-2 shaping or ring-3 **row** work. And it never *enforces* — it
**compiles**: each consumer (the shell, Vex) enforces its own native contract
in its own language, and the charter speaks that language at the boundary
(see **Compilers**). That boundary is what keeps it small.

---

## The grammar

A charter maps **role names** to selections. A role is either a bare list of
globs (the common case) or an object with at most four keys.

```json
{
  "viewer":  ["home", "crm.*.view"],

  "sales":   { "extends": ["viewer"], "allow": ["crm.*", "tasks.*"] },

  "intern":  { "extends": ["sales"],  "deny": ["crm.deal.delete", "*.export"] },

  "ray":     { "extends": ["sales"],  "without": ["agent-unsafe"] },

  "agent-unsafe": { "allow": ["*.form", "*.delete", "finance.*"] }
}
```

The four operative keys form a complete 2×2 — every key is add or subtract,
inline or by reference:

| | inline globs | named role |
|---|---|---|
| **add** | `allow` | `extends` |
| **subtract** | `deny` | `without` |

Sugar: a bare array is `{ "allow": [...] }`.

That is the entire grammar. Arrays contain only plain strings. There are no
sigils, no precedence rules, no conditions, no nesting beyond role references.

### Sections — one grammar, many universes

A role grants across one or more **sections**, each the same 2×2 atoms
resolving in that section's own **universe** of ids. The engine is
*universe-blind* — it globs over opaque strings and never learns what a string
means — so a section is just "which universe do these globs resolve in":

- **`actions`** — Nova action ids (`crm.deal.view`). The universe is the
  action library. This is the default: a bare array, or top-level
  `allow`/`deny`, *is* the actions section (the examples above and the corpus
  below are all actions-only roles).
- **`data`** — `table.verb` capabilities. The verb leaves mirror vex's
  phases: `read`, plus the three write ops under the `write` *namespace* —
  `deals.read`, `deals.write.insert`, `deals.write.update`,
  `deals.write.delete`. `write` itself is never an atom (leaves-only, as
  everywhere); **the umbrella is a glob** — `deals.write.*` grants every
  write, `*.write.delete` denies deletes across the board. The universe is
  derived from the schema, never authored ("the id hierarchy is the
  taxonomy", applied to verbs).

```json
{
  "viewer": { "extends": ["member"], "actions": ["crm.*.view", "crm.*s"], "data": ["*.read"] },
  "sales":  { "extends": ["viewer"], "actions": ["crm.*", "tasks.*"], "data": ["deals.write.insert", "deals.write.update", "tasks.write.*"] },
  "admin":  { "extends": ["sales"], "data": ["deals.write.delete"] },
  "intern": { "extends": ["sales"], "data": { "deny": ["*.write.delete"] } }
}
```

Delete is the scary verb, and it is just a leaf: sales edits deals all day
and cannot delete one; the admin's compiled policy is the only one where the
phase exists.

`extends`/`without` compose **every** section at once. Resolution, deny-wins,
and the verifier all run per section against the right universe — one matcher,
one resolver, one set of lints, reused. Adding a governed surface is adding a
universe and a compiler, never new grammar.

### Resolution

Resolution is a pure function from `(charter, action library)` to a concrete
set of action ids per role:

```
resolved(role) = ( ∪ resolved(extends)  ∪  match(allow) )
                 − match(deny)
                 − ∪ resolved(without)
```

- **Order-independent.** All subtraction is set-minus; lists can be reordered
  and merged without changing meaning.
- **Deny wins within a role.** There is no re-allow after a deny inside the
  same role. To permit an exception, deny more narrowly (see case 7 below).
- **Denies do not inherit.** `extends` unions *resolved sets*; a deny is local
  to the role that wrote it. A child role may re-add what a parent denied —
  and the verifier flags every such re-allow loudly (see F1).
- **Cycles are a boot error.**

The resolved set is hashed. That hash is the catalog cache key and the version
token pushed to connected clients — grant changes propagate mid-session over
the socket, and revocation is the same push with a smaller set.

### Globs

One wildcard rule, no more: `*` matches any run of characters, including dots.
`crm.*` matches `crm.deal.form`. There is no `**`, no brace expansion, no
regex. The day a pattern cannot be expressed, the answer is a better id, not a
richer glob.

### Who consumes the resolved set

Everything downstream consumes the resolved id set, never the charter itself:

1. **The shell catalog** — the definitions served to (or registered in) a
   principal's shell.
2. **Vex** — the compiled `ScopePolicy` (the `data` section) governing reads
   and writes.
3. **Cortex tool policy** — the agent's action surface via `policyGate`.
4. **The fn gate** — server functions are endpoints (`/fns/<name>`); a fn
   reachable through no granted action's endpoints does not execute.
5. **The verifier** — reports, diffs, and assertions (below).

---

## Compilers — charter speaks each consumer's language

The charter never enforces; it **compiles**. Each governed library keeps its
own native, self-sufficient contract, enforced by its own machinery — Nova
has the action map (an absent id throws `UnknownActionError`), Vex has
`ScopePolicy` (an absent phase is default-denied), Cortex has `ToolPolicy`.
None of them imports the charter or knows it exists.

And the charter imports none of *them* — there is no dependency in either
direction (decided 2026-07-16; "no dependencies beats optional"). The
charter's output is **string sets**; each governed target exports its own
*grants → native contract* intake, in its own string dialect, and the app
wiring (later the server's catalog service) composes the two:

| section | dialect (owned by the target) | intake | consumer |
|---|---|---|---|
| `actions` | action ids | the action map, filtered by ids | Nova's shell |
| `data` | `SCOPE_VERBS` leaves (`deals.write.insert`) | `scopePolicyFor(grants, behaviors)` | Vex |
| (future) | tool names | a `ToolPolicy` constructor | Cortex's `policyGate` |
| (future) | — | a served layout choice | Nova |

Each side stays pure and standalone: the charter is a string-set engine that
is always *handed* a universe and never manufactures one; Vex without a
charter is a hand-authored `ScopePolicy` (or `scopePolicyFor` over any flat
grant list); Nova is a hand-authored action map. Grafting policy onto
something new is additive — the target exports its dialect and intake, the
app passes the universe in. The test for whether a thing is
charter-governable is exactly this stack's house rule: **it is configured by
declarative data, and absence means denial.**

The `data` intake is the exemplar and the reason it's trivial: a Vex policy
already fuses two things — which *phases* an entity has (present or absent —
ACL, which the charter now owns) and what a phase *does* (its `match`/`set`
rules — row behavior, static and app-owned). So `resolved data grants →
which phases exist`, `behaviors table → what a phase does`, and a granted
phase carries its behaviors (or none). The viewer's mark-won dies because
their compiled policy has no `deals` write phase — not a gate anyone added,
one the charter never emitted.

The trusted path is a charter artifact too: the engine's *default* policy —
what direct callers (dev checks, Ray's query tool, the architect) run under —
compiles from a `system` role in the same document, never assigned to a
human. There is no policy in the app the charter does not own; even the
engine's own floor is a resolved, verified, diffable grant, and a verb the
`system` role lacks dies for the engine exactly as it does for a viewer.

---

## Naming is the taxonomy

The charter has no tags, no categories, no metadata predicates. **The id
hierarchy is the taxonomy**, and globs traverse it. This is a deliberate bet:
developers already maintain exactly one taxonomy with care — the one they use
to find their own things. A parallel tag vocabulary would drift; the namespace
cannot, because it is load-bea— *structural*.

Conventions this implies (scaffolding defaults, not grammar):

- Ids shaped `area.entity.variant`: `crm.deal.form`, `chrome.sidebar`,
  `finance.invoices`. (The devtools already did this instinctively:
  `devtools.dock`, `devtools.inspect`.)
- **Ids are leaves; namespaces are never actions.** If `crm.deals` exists,
  nothing is named bare `crm`. Removes the `crm` vs `crm.*` off-by-one.
- Variants are distinct ids: `crm.deal` and `crm.deal.view` are two actions
  (the latter derived from the former by a patch). The charter selects; it
  never shapes.
- A rename is a permissions change. That is a feature: the verifier diffs it.

---

## The corpus

The grammar is only as good as the cases it survives. Typical cases first,
then the ones that break other systems.

**1. Anonymous baseline**

```json
"public": ["auth.login", "auth.reset", "docs.*"]
```

**2. The classic ladder**

```json
"viewer": ["home", "crm.*.view"],
"editor": { "extends": ["viewer"], "allow": ["crm.*"] },
"admin":  { "extends": ["editor"], "allow": ["settings.*", "charter.*"] }
```

Administering permissions is itself just actions (`charter.*`) — see F6.

**3. Superadmin**

```json
"root": ["*"]
```

**4. Kiosk / single-purpose terminal**

```json
"warehouse-scanner": ["inventory.scan", "inventory.lookup"]
```

This terminal's *entire application* is two actions. There is nothing else to
attack, render, or misuse.

**5. Two hats**

```json
"sales-manager": { "extends": ["sales", "manager"] }
```

Sets union. No diamond problem — a granted action is granted; there is nothing
to override.

**6. Everything-except**

```json
"intern": { "extends": ["sales"], "deny": ["*.delete", "*.export", "finance.*"] }
```

The case that kills enumerated-list systems, in one line.

**7. Exception-to-the-exception**

*Interns may not delete anything… except their own drafts.*

```json
"intern": { "extends": ["sales"], "deny": ["crm.deal.delete", "crm.contact.delete"], "allow": ["drafts.delete"] }
```

**Awkward on purpose.** You cannot write `deny: ["*.delete"]` and claw back
`drafts.delete` — deny wins, there is no re-allow within a role. You must deny
*narrowly*. Allow/deny/re-allow chains are exactly where gitignore files
become write-only; the cost of enumerating denies buys charters that never
require simulating precedence in your head.

**8. An agent narrower than its human**

```json
"agent-unsafe": { "allow": ["*.form", "*.delete", "finance.*", "settings.*"] },
"ray":          { "extends": ["sales"], "without": ["agent-unsafe"] }
```

The muzzle is written once, positively, and worn by every agent role. The
AI-governance story is one line of the same grammar that does everything else.

**9. Plans, tiers, entitlements**

```json
"pro-only":  { "allow": ["reports.*", "api.*", "automations.*"] },
"free-seat": { "extends": ["sales"], "without": ["pro-only"] },
"pro-seat":  { "extends": ["sales"] }
```

A downgrade is swapping one assignment row. RBAC, feature flags, and billing
entitlements are the same mechanism.

**10. This one guy**

```json
"usr_017": { "extends": ["sales"], "deny": ["crm.export"] }
```

A principal-specific role is just a role.

**11. Contractor-until-March, break-glass, suspension — not charter.**

These are **assignment rows**: `{ principal, role, expires, grantedBy,
reason }`. Break-glass elevation is two ordinary actions (`request-elevation`
in the rep's catalog, `approve-elevation` in the manager's) whose effect is
writing an assignment row with an expiry; the catalog service watches
assignments and pushes the new catalog. Suspension is deleting rows — or
assigning `"suspended": []`, the empty catalog, which is a perfectly valid
application: a lock screen. The charter says what roles *are*; a table says
who *wears* them, when.

**12. A new action ships — who gets it automatically?**

`crm.quotes` is published; every role matching `crm.*` gains it, instantly,
pushed over the socket. Feature and footgun in one: the guard is not grammar
but the **publish-time diff** — *"crm.quotes → gained by: sales, sales-manager,
intern, ray."* If that line surprises anyone, the naming was wrong.

**13. Same action, different depth per role**

```json
"support": ["crm.deal.view"],
"sales":   ["crm.deal", "crm.deal.view"]
```

Clean *because* variants are distinct ids. The moment you want
`{ "allow": "crm.deal", "readonly": true }`, the answer is: that's a variant —
mint the id.

**14. "Can act, but needs manager approval" — not charter.**

Approval is part of what the action *is* — a fragment composed onto it (the
`confirm-delete` pattern that already ships in relay). If reps need approval
and managers don't, those are two variants, granted respectively.

**15. "Can only edit their OWN deals" — not charter, loudly.**

Row-level is Vex scope policy (`match: owner_id → userId`). The charter
decides whether the verb exists in your world; Vex decides which rows it may
touch. Every ACL system that mixes these ends up unreviewable.

**16. "Sees deals, never the margin" — not charter.**

Field-level is a patched variant with Prism redaction on the endpoint's
response transform. Column shaping lives in the artifact, not the grant.

**17. A global invariant: "nobody but finance ever touches finance.*"**

Genuinely awkward in per-role grammar — you would have to deny it in every
role forever, and one forgotten role breaks the promise. This is policy
*about* the charter and belongs to the **verifier** as an assertion:

```json
"assert": [{ "only": ["finance", "root"], "may-match": "finance.*" }]
```

The charter stays four keys; CI fails if any role drifts into finance.

---

## Known flaws, found on purpose

The design was red-teamed before writing this document. Three real flaws,
five smaller ones — with their resolutions. None required new grammar; all of
them moved work to the verifier.

**F1 — Deny does not survive `extends`.**
`intern` denies `crm.deal.delete`; `senior-intern` extends intern and re-allows
it. The algebra is consistent (a parent role is just a set) and viral denies
would break legitimate composition — but it quietly breaks the slogan "deny
always wins" (true only within a role). *Resolution:* visibility, not grammar.
The verifier flags every re-allow of an ancestor's deny, in every diff. If a
human approves that line, governance worked.

**F2 — Subtractive roles are loaded guns if assigned.**
`agent-unsafe` is a *positive* list that only subtracts because `without` uses
it that way. Accidentally assign it and the principal receives every form and
all of finance. *Resolution:* no grammar. Assignment gets the same guard as
publishing (case 12): the assignment diff renders in concrete actions —
"assigning `agent-unsafe` to usr_017 → gains `*.form`, `*.delete`,
`finance.*`" — and the verifier lints any role that is referenced in `without`
and also assigned. A human approves that diff.

**F3 — A typo'd deny fails silent, and silent means unprotected.**
`"deny": ["crm.deal.delte"]` matches nothing, forever. *Resolution:*
asymmetric linting — a dead **allow** is a warning; a dead **deny** is an
**error** by default.

**F4 — `crm` vs `crm.*`.** Solved by convention: ids are leaves, namespaces
are never actions. Verifier enforces.

**F5 — Orphan actions.** An action matched by no role is deployed
but unreachable — deny-by-default working, but usually a mistake. Verifier
reports orphans at publish.

**F6 — The charter can escalate itself.** Whoever holds `charter.edit` can
grant themselves root. The runtime gate is the charter itself: nobody holds
`charter.*` unless the charter grants it, and edits execute as
server-authoritative actions — audited, Vex-logged, composed with an approval
fragment where wanted. The assertion pinning the meta-loop (only `root` may
match `charter.*`) is CI lint: a tripwire, not the enforcement.

**F7 — Tenant overlays.** Per-tenant roles layer on a base charter with one
rule: overlays may add roles and extend base roles, **never redefine a base
name**. Shadowing `admin` per-tenant is how SaaS horror stories start.

**F8 — Versions.** Charters name logical ids only. Which *version* of
`crm.deal.form` a catalog serves is the artifact library's published-pointer
concern. A charter that needs to pin versions is a symptom, not a feature.

---

## The verifier is the other half

A pattern emerged across every iteration: the grammar stopped moving, and
every flaw found its fix in tooling. That is the intended shape. The charter
stays something a non-programmer reads aloud; the **verifier** carries the
opinions:

- resolves every role at boot / in CI — *if it boots, it's coherent*
- **dead deny = error**, dead allow = warning, orphan actions reported
- flags re-allows of an ancestor's deny (F1)
- flags roles referenced in `without` that are also assigned (F2)
- enforces id conventions (leaves only) and overlay rules (no shadowing)
- checks `assert` invariants (case 17, F6)
- runs the reachability closure per role (nav targets, channels) and reports
  dead emits and unreachable grants
- and above all: **`charter diff` renders in concrete actions, not globs** —
  "this change: intern +`crm.import`, −`confirm-delete`; ray unchanged." A
  human approves *that*, the same way this stack wants humans approving
  JSON-patch diffs of screens.

Nobody else in this market can have this tool, because nobody else's
permissions are closed data over closed artifacts. The charter is small so the
verifier can be sharp.

---

## What the charter refuses to do

For every temptation, the forwarding address:

| Temptation | Home |
|---|---|
| Row filtering ("only my deals") | The Vex policy's own `match` rules — a *behavior* of a phase the `data` section granted, not the charter |
| Column shaping ("no margin field") | Patched variant + Prism redaction (ring 2) |
| Approval / confirmation flows | Fragments composed onto the action (ring 2) |
| Time-boxed / conditional access | Assignment rows (a table) |
| Break-glass elevation | Two actions + an assignment row |
| Feature flags, plans, entitlements | Roles + `without` (already covered) |
| Cross-role invariants | Verifier `assert` |
| Version pinning | Artifact library pointers |
| Tags / metadata predicates | The id namespace |
| Grant-time shaping (`apply` a patch in a selector) | Refused — mint a variant id (ring 2) |

The charter maps names to selections — of actions, and of `table.verb` data
capabilities. It decides *whether the verb exists in your world*; everything
about *which rows*, *which columns*, or *what a variant looks like* has a home
that already exists.

---

## Settled

Decided in review (2026-07-15):

- **No `assignable`.** The grammar is exactly the 2×2 plus the bare-array
  sugar. `without` and `extends` share one namespace; assigning a subtractive
  role is guarded by the assignment diff and a verifier lint (F2), not by
  grammar.
- **The charter never shapes.** Grant-time patching (`{ "allow": "crm.*",
  "apply": "readonly" }`) is refused permanently. A variant is a distinct id
  minted in the library.
- **Assertions are lint.** The `assert` list is CI tooling, not a security
  boundary; the runtime gate is the charter itself (F6).
- **Server functions are endpoints** (`/fns/<name>`), gated by catalog
  closure like every other endpoint.

## Open questions

Argue here.

1. **Glob semantics.** Single `*`, matches across dots, nothing else. Is
   there a real case that forces segment-aware matching — and if so, is the
   answer richer globs or better ids?

2. **Principal-specific roles (case 10).** Roles named after users work, but
   should the charter *encourage* them, or should per-user exceptions be
   assignment-level to keep the charter role-shaped?

3. **The assertion grammar** (case 17, F6). Deliberately sketched, not
   designed. It lives in verifier config, not the charter — but it wants the
   same discipline: a minimal set of assertion forms and no more. What is
   that set?

4. **Naming.** The auth document is a *charter*. The server this all lives in
   still has no name. (Shelved, not forgotten.)
