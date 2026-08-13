# lyra — identity below the engine

**Status: NOT STARTED, 2026-08-13.** Nothing here is built. The problem is
diagnosed and the design is agreed; Part 9 lists what a human must decide before
Part 7 can begin. Part 7.0 is six independent defects that stand on their own
merit and can land before any of the rest.

Scope spans `moss`, `charter` and `lyra`. Atrium and relay carry the same shape
and are **deliberately out of scope** — they are demos; Lyra is the production
app.

Every claim carries a `file:line`. Figures in Part 3 marked **measured** were
**verified by execution** (`pnpm --filter lyra census`, 2026-08-13); everything
else is read from source. If something is not cited, treat it as unverified
opinion and check it.

---

## Part 0 — the honest preamble

This started with a reviewer's note:

> ③ The directory is an in-memory table. `loadDirectory` SELECTs every person ×
> studio into module-level maps and rebuilds on `studio_integrations` writes
> (users.ts:60). At hundreds of studios × 2,000 members that's ~500k rows in a
> Map, in the identity path, per process — and it's what makes horizontal
> scaling awkward, because every process holds the whole directory and reloads
> independently.

The note found the right file and the wrong problem. Three specifics are wrong,
and each would have sent the work somewhere useless:

1. **"every person × studio" overstates it.** The SELECT does cross-join
   ([`users.ts:88`](../../apps/lab/lyra/src/server/users.ts#L88) — `people` LEFT
   JOIN `staff` LEFT JOIN `studio_people`, unconstrained on both sides), but the
   map is keyed by person id ([`users.ts:118`](../../apps/lab/lyra/src/server/users.ts#L118)),
   so duplicates collapse. Memory is **O(people)**, not O(people × studios). At
   the stated target — hundreds of studios, 50–2,000 members each
   ([`PLAN.md:72`](../../apps/lab/lyra/PLAN.md#L72)) — that is 100k–600k entries.
   ~500k lands in the right range for the wrong reason.

2. **"in the identity path" is imprecise.** The per-request path is
   `app.scope(principal)` ([`server.ts:250`](../../packages/moss/src/server.ts#L250)
   → [`app.ts:127`](../../apps/lab/lyra/src/app/app.ts#L127)), which is a handful
   of O(1) map hits. Lookup is constant and always will be. The size is a memory
   and reload problem, not a latency one. The one real per-request cost is
   unrelated to it: `studioToday` constructs a fresh `Intl.DateTimeFormat` per
   call ([`users.ts:157`](../../apps/lab/lyra/src/server/users.ts#L157)) and
   `scope` reaches it twice.

3. **"awkward" undersells the last sentence, which is the best one.** There is
   no cross-process invalidation at all: the `studio_integrations` reaction fires
   only in the process that handled the write
   ([`app.ts:220`](../../apps/lab/lyra/src/app/app.ts#L220)). At two processes
   this is a **correctness bug, not a scaling concern** — a pack installed via
   process A leaves process B with a stale `INSTALLED`,
   `integrationActorFor` returns null there
   ([`users.ts:146`](../../apps/lab/lyra/src/server/users.ts#L146)), and keyed
   integration calls are refused on some processes and not others until restart.

And the thing the note missed is larger than the thing it found. It is in Part 1.

---

## Part 1 — what was measured: a signature decided this, not a person

Moss's shell manifest declares two hooks and calls them twins — `seeds` is
*"the instance twin of `inputs`"*
([`app.ts:316`](../../packages/moss/src/app.ts#L316)). They were handed different
tools:

```ts
seeds?:  (session: { principal, actions, roles, wire }) => Promise<...> | ...   // app.ts:324
inputs?: (session: { principal, actions, roles         }) => Record<...>        // app.ts:336
```

`seeds` is async and receives the governed internal wire, with a comment saying
why: *"May be async (a derivation usually reads resolved rows)"*
([`app.ts:322`](../../packages/moss/src/app.ts#L322)). `inputs` is synchronous
with no wire — and it needs the same rows.

Where moss handed the app a wire, the app read through the engine. Where moss
handed it a synchronous signature, the app built a private copy of the database.
Same app, same file, same authors.

That correlation holds across every per-principal seam moss offers:

| moss seam | shape | resident state it forced in Lyra |
|---|---|---|
| `assignments` ([app.ts:33](../../packages/moss/src/app.ts#L33)) | eager `Record` | `DIRECTORY`, via `everyone()` |
| `scope` ([app.ts:49](../../packages/moss/src/app.ts#L49)) | sync | `DIRECTORY`, `TIMEZONES`, `COUNTRIES`, `LOCALES` |
| `phrases` ([app.ts:66](../../packages/moss/src/app.ts#L66)) | sync | `BY_LOCALE` |
| `installedIntegrations` ([app.ts:84](../../packages/moss/src/app.ts#L84)) | sync | `INSTALLED` |
| `integrationActor` ([app.ts:98](../../packages/moss/src/app.ts#L98)) | sync | `DIRECTORY` |
| `shell.inputs` ([app.ts:336](../../packages/moss/src/app.ts#L336)) | sync, no wire | `DIRECTORY`, `BY_STUDIO`, `BY_LOCALE` |
| **`shell.seeds`** ([app.ts:324](../../packages/moss/src/app.ts#L324)) | **async + wire** | **none** |

Six synchronous seams produced eight module-level caches across three files. The
one asynchronous seam with a wire produced none.

**A synchronous hook cannot perform I/O**, so a resident map is the only
implementation that can satisfy it. The directory is not a decision anybody made;
it is the shape `NiscApp` demands. This is a library-shape problem, and it cannot
be fixed by review discipline — it already survived review by people who had
written the post-mortem ([`AGENTS.md:282`](../../AGENTS.md#L282), *Believe the
schema over the resolver*, which is about this same file).

### Moss's own design document indicts the result on three counts

- *"A second way to do anything — Reads are vex, writes are vex... Moss adds no
  vocabulary of its own"* ([DESIGN.md:380](../../packages/moss/DESIGN.md#L380)).
  The directory is a second way to read.
- *"The app lane carries no rows... handing rows to a callback puts data in the
  one place this stack has no fence for, arbitrary imperative code"*
  ([DESIGN.md:316](../../packages/moss/DESIGN.md#L316)). Moss refuses to hand
  write reactions their rows on that principle. A synchronous seam then places
  the entire population in arbitrary imperative code through the front door.
- *"A new generation is a new manifest, and the per-principal memos die with it —
  no invalidation protocol"* ([DESIGN.md:58](../../packages/moss/DESIGN.md#L58)).
  `loadDirectory` mutates state a frozen manifest closed over. That is the only
  reason `world.refresh` and `server.refresh()` exist; the stated design says
  neither should have to.

---

## Part 2 — the inventory

### 2.1 The caches

| File | Module-level state | Written by |
|---|---|---|
| [`server/users.ts`](../../apps/lab/lyra/src/server/users.ts) | `DIRECTORY` (:19), `TIMEZONES` (:22), `COUNTRIES` (:24), `LOCALES` (:27), `BY_EMAIL` (:28), `INSTALLED` (:55) | `loadDirectory` (:64) |
| [`server/themes.ts`](../../apps/lab/lyra/src/server/themes.ts) | `BY_STUDIO` (:8) | `loadThemes` (:10) |
| [`server/phrases.ts`](../../apps/lab/lyra/src/server/phrases.ts) | `BY_LOCALE` (:23) | `loadPhrases` (:25) |

Three files, eight caches, one pattern: `loadX(pool)` writes module state,
everything downstream reads it synchronously forever. **`users.ts` is not an
outlier — it is the house style**, and `phrases.ts` was written while this plan
was being drafted.

### 2.2 The accretion

The app-side `Directory` type ([`app.ts:33`](../../apps/lab/lyra/src/app/app.ts#L33))
began as an identity lookup and now carries **13 methods**: `person`, `everyone`,
`themeFor`, `installedFor`, `integrationActor`, `rolesOf`, `todayFor`,
`horizonFor`, `countryFor`, `localeFor`, `phrasesFor`, `localesFor`,
`greetingFor`. Themes, clocks, currency, language and greeting text all arrive
through the identity seam, because that is where the map already was.

### 2.3 What is live today

| Defect | Site |
|---|---|
| Full scan per automation effect — the id is already derivable from `scope.automationActor` | [`tide.ts:17`](../../apps/lab/lyra/src/server/tide.ts#L17) |
| Full scan per notification, to reach only principals holding a live shell | [`app.ts:208`](../../apps/lab/lyra/src/app/app.ts#L208) |
| Full scan per language change, to find whose shell to rebuild | [`world.ts:118`](../../apps/lab/lyra/src/server/functions/world.ts#L118) |
| **Entire roster — every name and email — served to unauthenticated requests** via the login picker | [`app.ts:340`](../../apps/lab/lyra/src/app/app.ts#L340) |
| Stale `INSTALLED` on every process but the writer's | [`app.ts:220`](../../apps/lab/lyra/src/app/app.ts#L220) |
| Tenant-local write drops every principal's memos process-wide and re-adopts every live shell | [`server.ts:903`](../../packages/moss/src/server.ts#L903) |
| Four unbounded, unevicted per-principal maps, keyed by principal though their contents depend only on (roles ⊕ installed) | [`server.ts:118`](../../packages/moss/src/server.ts#L118)–165 |

The roster disclosure deserves its own line: it is the class of hole the charter
exists to prevent, sitting in the one place the charter is structurally blind to.
`acl-check`, `scope-check`, `visibility-check` and `reachable-check` all reason
about vex entries and policies. Nothing read through `DIRECTORY` touches a table
vex governs, so **none of them can see it**.

### 2.4 One latent hazard, recorded before it matters

The cross-join at [`users.ts:96`](../../apps/lab/lyra/src/server/users.ts#L96)
plus last-write-wins on a person-id key means a person who is staff at studio A
and anchored at studio B lands as one row with `studioId = A` and
`studioPersonId` pointing at B's anchor. `scope.personId` is then set
([`app.ts:127`](../../apps/lab/lyra/src/app/app.ts#L127)) and `rolesOf` grants
`member` at a studio that does not know them
([`users.ts:47`](../../apps/lab/lyra/src/server/users.ts#L47)). Row reads fail
closed — `studio_id` will not match — but the `hub.me` surface opens.

Not reachable from the current seed. Multi-studio identity is a planned feature,
and this is where it will bite. See decision D6.

---

## Part 3 — why nothing caught it

**Measured** (`pnpm --filter lyra census`, verified by execution):

- `code-census.ts` classifies files by directory, and `server/` maps
  unconditionally to the `endpoint` edge
  ([`code-census.ts:63`](../../apps/lab/lyra/src/dev/code-census.ts#L63)).
  Everything under it is a licensed edge by fiat — **the directory can never be
  flagged**. 505 lines of `server/` imperative code sit inside that amnesty.
- The census is **not** in [`all-checks.ts`](../../apps/lab/lyra/src/dev/all-checks.ts).
  It is a separate manual `pnpm census`. The one tool that measures the thesis is
  the one thing not wired to CI.
- 134 rule-16 breaks today: 132 type assertions (37 in the app, 95 in checks),
  one `function` declaration, one non-null `!`. Counted, never prevented.
- 140 lines of code sit in artifact files, unnamed by the five edges.
- The application layer itself is **98.4% authored data** — `app/` is clean. The
  discipline held exactly where it was written down.

What is missing is a rule, not a tool:

- [`sql-check.ts`](../../apps/lab/lyra/src/dev/sql-check.ts) polices **how** SQL
  is written — parameterised, never spliced — and does it well, including a
  falsifiable self-test. Nothing polices **where** SQL may live, who may hold its
  results, or for how long.
- Nothing in the repo inspects module-level mutable state. The problem was never
  the query; it is the `let DIRECTORY` that outlives it.
- There is **no ESLint** in the repo. No config exists.

---

## Part 4 — what is legitimately below the engine

One thing, and it must be named rather than left implicit.

A vex read requires a compiled `ScopePolicy`
([`handler.ts:43`](../../packages/vex/src/handler.ts#L43)); a policy is compiled
from a principal's roles ([`principal.ts:31`](../../packages/moss/src/principal.ts#L31));
roles come from the directory. **The read that resolves a principal cannot be
authorised, because authorisation needs its answer.** Every system has this. It is
the one honest reason for a query that does not pass through the engine.

The legitimate surface is exactly `principal → { roles, scope values }`. One row,
on demand, for the principal presenting a token.

Everything else in `server/` — studio timezones, countries, locales, names, theme
tokens, phrase books, integration installs, the person roster — is ordinary
application data. It has tables, verbs and a charter. It is outside the engine
only because a synchronous signature made it free to be.

---

## Part 5 — the design

Four moves. Three are the plan; the fourth is where the plan is heading.

### Move 1 — symmetry: every per-principal seam gets what `seeds` has

Make `assignments`, `scope`, `phrases`, `installedIntegrations`,
`integrationActor` and `shell.inputs` asynchronous, each handed the internal wire
([`shells.ts:53`](../../packages/moss/src/shells.ts#L53)). Moss resolves them at
the session boundary and **owns the resulting cache**.

The argument for this is that it invents nothing. Moss already chose this shape
for `seeds`; this finishes applying it. No new vocabulary, no new concept. It
dissolves all eight caches, because every one exists to serve a synchronous seam.

### Move 2 — identity as a declared artifact

The manifest declares *which vex entry resolves a principal* and *which prism
maps its row onto roles and scope values*. Moss executes that entry over the
internal wire under a bootstrap policy, once per session, and caches the result.

- [`users.ts`](../../apps/lab/lyra/src/server/users.ts) ceases to exist. No
  imperative identity code, no raw SQL.
- Identity becomes an artifact — diffable, reviewable, and **visible to the checks
  that already audit reads**. Today it is the one thing in the application no
  check can see (Part 2.3).
- It keeps *"reads are vex"* true, which Move 1 alone does not: an async seam with
  a wire still permits a hand-rolled query behind it.

**Security surface, called out deliberately:** a bootstrap policy must execute a
*fixed, manifest-declared entry only*. Never a caller-supplied fingerprint, never
reachable from an HTTP surface. This is the highest-risk part of the plan. See D4.

### Move 3 — close the hatch, at authoring time

`server/` and `functions(session)` were meant to be escape hatches for what the
libraries did not yet support ([`AGENTS.md:7`](../../AGENTS.md#L7), the five
edges). They became the main path. Once Moves 1 and 2 supply the capability,
remove the ability to take the old road.

**ESLint earns its place here, and the argument is about timing, not
capability.** The existing checks are more expressive than any lint rule —
`sql-check` asserts its own rule catches a bad example, which no lint config
does. But checks fire after code is written, reviewed and merged. ESLint fires in
the editor, before the line exists. For a rule whose entire purpose is *"do not
start down this road"*, authoring time is the only time that matters:
`phrases.ts` was written by someone who had already read the post-mortem about
`users.ts`.

| Layer | Enforces | When |
|---|---|---|
| ESLint | syntax — restricted imports, module-scope mutable state, rule 16 | keystroke |
| `dev/*-check.ts` | semantics — behaviour asserted against a running app | CI |
| `code-census` | the thesis — code outside the five edges | CI |

### Move 4 — generational manifests (the destination)

Make row-derived state part of the manifest generation. A write to `studios`,
`themes`, `phrases` or `studio_integrations` mints generation N+1; the memos die
with the old manifest; shells adopt; other processes observe a pointer move.

This is not a new idea — it is moss's stated design, unbuilt
([DESIGN.md:56](../../packages/moss/DESIGN.md#L56), and the artifact library at
[DESIGN.md:386](../../packages/moss/DESIGN.md#L386)). It solves invalidation, the
`refresh()` blast radius and multi-process staleness with one mechanism instead
of three bolt-ons, and it retires `world.refresh` entirely.

**Sequencing:** Moves 1 and 2 need *an* invalidation story before Move 4 lands.
The interim is an explicit `invalidate(principal)` plus a Postgres
`LISTEN/NOTIFY` channel so every process hears it. Move 4 subsumes both. Note
that moss lists *"scale-out beyond sticky sessions"* under **Deliberately
unbuilt** ([DESIGN.md:400](../../packages/moss/DESIGN.md#L400)) — the gap is
declared, but Lyra is production and needs it closed.

### Considered and rejected

**A tenant-aware `Directory` service inside moss.** Moss's refusal table is
explicit: *"An auth provider — BYO identity. The server consumes a session token,
never mints one"* ([DESIGN.md:377](../../packages/moss/DESIGN.md#L377)). Caching
an opaque blob the app produced preserves that. Knowing what a studio is does not.

**A `defineResident` primitive for per-tenant derived state.** It would cure
`themes.ts` and `phrases.ts`, which Moves 1 and 2 do not fully reach. **Held, not
rejected:** if Move 4 lands, resident state is simply part of a generation and the
primitive is redundant. Deciding it before Move 4 is deciding it in the wrong
order.

---

## Part 6 — the invariants

Normative. Every one is mechanically checkable, and each should be asserted by a
check rather than trusted (Part 8.3).

1. **No enumerator.** The cache exposes `get(principal)` and nothing returning a
   collection. Enumeration is an *operator* capability, on the shell-roster model
   ([`shells.ts:127`](../../packages/moss/src/shells.ts#L127)), never an
   application one. **This is the load-bearing invariant**: size is not what made
   the directory a database — `everyone()`
   ([`users.ts:179`](../../apps/lab/lyra/src/server/users.ts#L179)) is. You cannot
   scan what you cannot list.
2. **Point lookup only.** No secondary indexes. `BY_EMAIL` is the tell — a second
   index is a query planner, and a query planner means a database.
3. **Everything derivable.** Losing the cache must lose no information. If
   dropping it loses something, it was not a cache.
4. **Opaque contents.** No line of moss code reads a field off an app-supplied
   blob. The moment moss says `.studioId`, moss has learned what a tenant is and
   the boundary is gone. Scope values are merged without inspection, role lists
   handed to charter, integration ids filtered against. All pass-through.
5. **Bounded, evicted, revalidated, rostered — from day one.** On the model moss
   already applies to durable shells: `shellIdleMs`
   ([`runtime.ts:21`](../../packages/moss/src/runtime.ts#L21), 30-minute default
   at [`shells.ts:141`](../../packages/moss/src/shells.ts#L141), swept at :588),
   `sessionRevalidateMs` ([`runtime.ts:29`](../../packages/moss/src/runtime.ts#L29)).
   Knobs belong on the runtime, not the manifest — moss's own reasoning: *"an
   operational decision about a deployment, not something an application is
   written against"* ([`runtime.ts:18`](../../packages/moss/src/runtime.ts#L18)).
6. **Breaks rather than degrades.** Bounded and metered, with the bound asserted
   in a check. The directory's worst property is that it works beautifully at demo
   scale and dies at production scale with no signal in between.
7. **Growth requires changing a declared contract.** The cache holds only what a
   declared seam returns. Adding a field is a diff someone approves, not a
   property added to a local object. This is what converts accretion from a habit
   into a decision — and it is why `Directory` reached 13 methods without anyone
   deciding it should.

### On whether moss should understand principals

It already does, deliberately: the principal is the key of the durable shell, the
memo, the socket identity and the resolved catalog. *"The resolved catalog is the
application"* ([DESIGN.md:10](../../packages/moss/DESIGN.md#L10)) requires it.

What moss must not understand is what a principal **contains**:

- **moss** owns the principal as an opaque, stable key — and its lifetime.
- **charter** owns the principal as a role-bearer — roles to grants.
- **the app** owns the principal as a person in a tenant.

Caching is a key-level concern, and moss already holds four per-principal caches
of compiled objects it never interprets
([`server.ts:118`](../../packages/moss/src/server.ts#L118)–165). Relocating
identity there is not new responsibility; it is the responsibility moss already
has, held with the bounds and roster it already applies to the far more expensive
thing.

---

## Part 7 — the build order

### 7.0 — six defects that stand alone

Independent of everything below. Land these first; each is live today.

| Fix | Site |
|---|---|
| Derive the automation principal instead of scanning | [`tide.ts:17`](../../apps/lab/lyra/src/server/tide.ts#L17) |
| Deliver notifications via the live-shell roster | [`app.ts:208`](../../apps/lab/lyra/src/app/app.ts#L208) |
| Rebuild shells via the roster, not the population | [`world.ts:118`](../../apps/lab/lyra/src/server/functions/world.ts#L118) |
| Stop serving the full roster to anonymous requests | [`app.ts:340`](../../apps/lab/lyra/src/app/app.ts#L340) |
| Cache the per-studio `Intl.DateTimeFormat` | [`users.ts:151`](../../apps/lab/lyra/src/server/users.ts#L151), :161 |
| Fix the single-role rebuild — it still does `[person.audience]`, the flattening the production path was fixed away from ([`app.ts:243`](../../apps/lab/lyra/src/app/app.ts#L243) records why) | [`acl-check.ts:105`](../../apps/lab/lyra/src/dev/acl-check.ts#L105) |

Three of the first four want the **live-shell roster**, which moss already
exposes. They were scanning the population to find the handful who were
connected.

### 7.1 — moss and charter: the seams

1. Add `wearable` to charter's verifiers; remove their dependence on the
   assignment map ([`verify.ts:154`](../../packages/charter/src/verify.ts#L154),
   [`principal.ts:108`](../../packages/moss/src/principal.ts#L108)).
2. Re-key moss's four memo maps by (role set ⊕ installed set) rather than
   principal. Collapses them from O(principals) to ~10 entries and makes any
   refresh cheap.
3. Introduce the `identity` seam alongside the existing five. Both paths live
   during migration; the old seams are deprecated, not deleted.
4. Implement the cache in moss with eviction, revalidation, bound and roster —
   invariants 5 and 6 **from the first commit**, not retrofitted.
5. Add `invalidateIdentity` and the `LISTEN/NOTIFY` channel. This closes the
   two-process correctness bug.

### 7.2 — moss: the wire, everywhere

6. Make `shell.inputs` async and give it the wire, matching `seeds`.
7. Move `integrationActor` to the wire-bearing signature.

### 7.3 — lyra: migrate onto the seams

8. Implement `identity` over the wire. Delete `DIRECTORY`, `BY_EMAIL`, `INSTALLED`.
9. Move themes, locales, countries, timezones and phrases to reads through the
   wire at session resolution. Delete `themes.ts` and `phrases.ts` module state.
10. Migrate the eleven sites touching `app.assignments` — four in production
    ([`app.ts:106`](../../apps/lab/lyra/src/app/app.ts#L106),
    [`world.ts:60`](../../apps/lab/lyra/src/server/functions/world.ts#L60)), the
    rest in checks.
11. Delete [`users.ts`](../../apps/lab/lyra/src/server/users.ts).

**Do not forget the other three consumers.** `assignments` is also passed to
`defineApp` by atrium, atrium/admin and lyra-admin — all three pass *authored
static records*, so conversion is mechanical, but the type change is breaking and
they must compile and stay green.

### 7.4 — declared identity (Move 2)

12. Bootstrap policy in vex — fixed declared entry, unreachable from HTTP.
13. `identity.entry` + `identity.map` in the manifest.

### 7.5 — enforcement (Move 3)

14. ESLint, per Part 8.1.
15. Remove the `server/` amnesty from `code-census`; add the held-state
    classification per Part 8.2.
16. Wire `census` into `all-checks.ts`.

### 7.6 — generational manifests (Move 4)

Its own plan. Retires `world.refresh`, the `refresh()` blast radius and the
interim `LISTEN/NOTIFY`.

---

## Part 8 — enforcement detail

### 8.1 ESLint rules worth having

| Rule | Enforces |
|---|---|
| `no-restricted-imports`, zoned | `app/` may not import `server/` |
| `no-restricted-syntax` | no module-scope mutable binding outside a declared list |
| custom: *module binding assigned from an awaited call* | the disease itself, precisely |
| typed rules for rule 16 | `any`, `as`, `!`, `enum`, `class`, default export, `function` — 134 breaks today |

### 8.2 Census changes

`edgeOf` ([`code-census.ts:60`](../../apps/lab/lyra/src/dev/code-census.ts#L60))
maps `server/` to `endpoint` unconditionally. Replace with real classification and
add a category the census cannot currently see: **held state**. Three kinds exist
and only one is a defect —

- **row-backed caches** (the target): assigned inside a loader from a query result.
- **authored constants** (must not flag): `AUDIENCE_OF`
  ([`users.ts:30`](../../apps/lab/lyra/src/server/users.ts#L30)), `REGIONS`, and
  the provider tables in atrium and relay. Legitimate authored data.
- **late-bound singletons** (needs a carve-out): `driver`
  ([`boot.ts:29`](../../apps/lab/lyra/src/server/boot.ts#L29)). Neither cache nor
  constant.

The honest discriminator is *assigned from a query result*, mechanically
detectable on the AST the census already walks.

### 8.3 Checks that should exist afterwards

- **Invariant 3, directly:** drop the identity cache mid-run, assert identical
  behaviour.
- **Invariant 4:** assert no moss source file reads a field off an app-supplied
  scope blob.
- **Invariant 5:** assert the bound is enforced and eviction occurs.
- **Invariant 1:** assert the cache type exposes no collection-returning method.

Follow [`sql-check.ts`](../../apps/lab/lyra/src/dev/sql-check.ts) and
[`separation-check.ts`](../../apps/lab/lyra/src/dev/separation-check.ts) in
including **falsifiable self-tests** — each asserts its rule catches a known-bad
example and does not flag a known-good one. Without that, a rule matching nothing
passes trivially.

---

## Part 9 — what a human must decide first

Answers needed **before** Part 7.1, not during.

| # | Decision | Why it blocks |
|---|---|---|
| **D1** | **Session lifetime vs. mid-session role change.** If identity resolves once per session, what invalidates it, and what may a stale principal do in the window? `world.refresh` answers today with a shell reset; that must become the general mechanism. `sessionRevalidateMs` is the existing precedent and possibly the same clock. | **Highest uncertainty in the plan.** Gates 7.1–7.3. Everything else here is bounded and countable. |
| **D2** | **Who declares `wearable`?** The app, or derived from the charter? Deriving is tempting and may be wrong — the charter defines roles, not which combinations a person can hold. | Shape of the charter API change. |
| **D3** | **Does `scope` stay per-request or become per-session?** Per-request today ([`server.ts:250`](../../packages/moss/src/server.ts#L250)); per-session is the point of the cache. | Probably decided with D1. |
| **D4** | **Bootstrap policy reachability.** Confirm it cannot be reached from any HTTP surface and cannot accept a caller-supplied fingerprint. Wants an adversarial check, not a code review. | Gates 7.4. Security. |
| **D5** | **Are `dev/` checks held to rule 16?** 95 of 132 type assertions live there. | Sizes the 7.5 backlog. |
| **D6** | **Multi-studio identity** (Part 2.4). One principal per (person, studio)? | Latent now, load-bearing later. Decide before the feature, not during. |
| **D7** | **Census scope** — lyra-only, or promoted to a shared tool? Atrium and relay hold ~6,200 lines of unaudited `server/` between them. | Lyra-only is the stated priority; say so explicitly or it drifts. |
| **D8** | **The red-on-day-one backlog.** When the census becomes a gate it fails against the current tree. One decision per violation, or a baseline? | A baseline is how this class returns. |

---

## Part 10 — what "done" looks like

- [`apps/lab/lyra/src/server/users.ts`](../../apps/lab/lyra/src/server/users.ts)
  does not exist. Neither does module state in `themes.ts` or `phrases.ts`.
- `grep -r "everyone()" apps/lab/lyra/src --include=*.ts` returns nothing outside
  `dev/`. Five production callers today.
- No unauthenticated request can obtain more than one person's row.
- Two processes serving the same database agree about installed packs, roles and
  themes without a restart.
- A tenant-local write invalidates that tenant, not the deployment.
- Identity is an artifact a check can read, and at least one existing check
  (`acl-check` or `visibility-check`) asserts something about it that it cannot
  assert today.
- `pnpm --filter lyra check` runs the census and passes.
- The four invariant checks in Part 8.3 exist and are in `all-checks.ts`.

## Part 11 — risks

- **Moss inherits a correctness burden it does not have today** — cache lifetime,
  invalidation, and what a stale principal can do in the window. Better held in
  one instrumented place than eight ungoverned maps, but it does not disappear,
  and it is where this plan is earned or lost. **The contract must be specified
  before code, not discovered during it** (D1).
- **The bootstrap policy is a genuine new security surface** (Move 2, D4).
- **7.1–7.3 are a breaking change across four apps.** Three are mechanical, but
  they must compile and their checks must pass.
- **The deprecation window is itself "a second way to do everything"** — the thing
  moss refuses ([DESIGN.md:380](../../packages/moss/DESIGN.md#L380)). Close it in
  7.3, same release.
- **Move 4 is large enough to become permanent scaffolding if deferred
  indefinitely.** The interim `LISTEN/NOTIFY` must be written as interim and
  recorded as such.
