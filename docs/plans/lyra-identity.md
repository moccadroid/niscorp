# lyra — identity below the engine

**Status: REBUILT (2026-08-14).** The first "done" was a lie of accounting: the caches
were gone, but the architecture underneath them was fifteen raw SQL statements spread
across `server/` — the directory rebuilt as queries, with a private `Person` model no
check could see. That version is deleted. What stands now, held by
[`reads-are-vex-check`](../../apps/lab/lyra/src/dev/reads-are-vex-check.ts) IN the
suite:

- **One licensed statement.** `server/identity.ts` holds exactly one query — the
  roles read, the only read a policy cannot authorise because it compiles from the
  answer. The count is asserted (`=== 1`), its tables are asserted equal to the
  `identity/roles` artifact's declaration, and both checks carry falsifiable
  self-tests. The budget is a count, not a list anybody can widen.
- **The person model is an artifact.** `identity/roles` in
  [`identity.entries.ts`](../../apps/lab/lyra/src/app/vex/identity.entries.ts) maps
  three facts to the whole seam record — roles, tenant tag, derived scope — as an
  executed prism. `audienceOf`, `rolesOf`, `Person`, `personCard` and `lookup.ts` do
  not exist.
- **Everything else is the engine.** Name, studio facts, installs, themes, phrase
  books, locales, the automations vocabulary — all seeded entries
  (`identity/person`, `identity/studio`, `identity/installed`, `studio/theme`,
  `phrases/book`, `phrases/integrations`, `phrases/locales`), read either by moss as
  the charter's **`identity` reader role** (a role nobody wears, pinned to the caller
  by the `identity` reach in behaviors.ts) or over each session's own wire under its
  own policy. Members get sessions without members getting `people.read` — the
  roster stays refused.
- **Two principals need no read at all.** An integration actor and a studio's robot
  are named by their own ids (`ig_<integration>@<studio>`, `automation@<studio>`);
  the install gate rides `identity/installed`, and the automation unification makes
  the chain-trust comparison (`userId === automationActor`) exact — closing 12.4.
- **There is no doors list, because there are no doors.** Every surface that acts
  without a principal — the sign-in credential (`links.ts`), unsubscribe, the mail
  provider's webhook, the lab's picker, the automations engine loading its rows —
  executes seeded entries through **`server.executeAs`** as one of four machinery
  charter roles (`credential`, `mailer`, `transport`, `scheduler`): in-process only,
  replay-only, charter-bounded, reach-pinned, none of them wearable. The one `exec`
  exception is `server/runtime.ts`, the lab's database builder applying the declared
  `db/` artifacts — creating the database is not reading it. Widening any of this is
  a charter diff somebody reviews, not a list entry.

Everything green: 47/47 Lyra checks (the law included), moss 186/186, charter 17/17,
five apps typecheck clean, lint 0.

## Part 10, scored

| Criterion | |
|---|---|
| `server/users.ts` does not exist | **yes** — deleted, along with `themes.ts` and `phrases.ts` module state |
| `grep -r "everyone()" --include=*.ts` returns nothing outside `dev/` | **yes** — 0 callers |
| No unauthenticated request obtains more than one person's row | **yes** — the picker is behind `LYRA_DEV_LOGIN`, asserted both ways |
| Two processes agree without a restart | **yes** — the generation pointer |
| A tenant-local write invalidates that tenant, not the deployment | **yes** — see below |
| Identity is an artifact a check can read | **yes** — pinned by `identity-sql-check` rather than declared in vex (D4 chose (b)) |
| `pnpm --filter lyra check` passes | **yes** — 44 checks, including four that did not exist |
| The Part 8.3 invariant checks exist | **yes** — invariants 1, 3, 4, 5, 6 asserted across `identity-check`, `identity.test.ts`, `held-state-check` |

**The criterion I first wrote off, and was wrong about.** This was recorded here as
unachievable: forgetting one tenant means naming its principals, and naming them
without enumerating the population looked like it needed the secondary index
invariant 2 bans. That reasoning does not survive reading the invariant. It bans an
index you can **read** through — *"a second index is a query planner"* — because a way
to find somebody is a way to scan everybody. An index that supports exactly one
operation, FORGET, returns nothing and finds nobody.

So `IdentityRecord` carries an opaque `tag`, moss keeps a write-only `tag → principals`
map beside the cache, and `server.invalidateTenant(tag)` drops that group and answers
how many it held. Moss never interprets the string; Lyra sets it to the studio id.
The `studio_integrations` reaction now forgets one studio instead of every principal
in the deployment. Asserted in `identity.test.ts` (four cases, including that the map
prunes on eviction and that the cache's surface exposes no way to read through it) and
end-to-end in `identity-check`.

**Two things it must NOT do**, both found by the suite rather than by reasoning:

- **It must not reset shells.** Resetting throws a shell away and rebuilds it, which is
  right for a ROLE change and wrong here: a tenant installing an integration changes what its
  people may reach, not who they are, and `adopt` already re-resolves every live shell
  in place. Resetting as well discarded whatever anybody at that studio was doing to
  arrive at the same screen — and broke three integration assertions.
- **It must reset nobody else.** The first version looped `shells.list()` and reset
  every live principal whenever anything was dropped, which is the deployment-wide
  hammer wearing a tenant-local name. `invalidateTag` returns WHO it forgot for exactly
  this reason: a count would leave the caller guessing, and guessing here means
  resetting everybody to be safe.

**Still deployment-wide, honestly:** the generation pointer. A second process holds its
own copies of the same tenant's records and has no other way to hear, so the pointer
moves and every process drops everything. Coarse across processes, precise within one.
Move 4 is where that asymmetry goes.

## What replaced what

| Was | Is |
|---|---|
| eight module caches (`users.ts`), then briefly fifteen raw queries (`lookup.ts` and friends) | ONE licensed statement + seeded entries, the split `reads-are-vex-check` enforces |
| `BY_STUDIO` (`themes.ts`) | `studio/theme` entry, read over the session's wire at shell build |
| `BY_LOCALE` (`phrases.ts`) | `phrases/book` + `phrases/integrations` + `phrases/locales` entries, folded by `bookOverWire` |
| the `Directory` seam and `assignments` | the `identity` seam — one licensed read plus the reader-role entries — held by moss with a bound, eviction, revalidation, a meter and an operator roster |
| six synchronous per-principal seams | all async; `inputs` and `phrases` wire-bearing, `FunctionSession` carrying the record and the catalog |
| nothing watching module state or SQL residence | `held-state-check`, `reads-are-vex-check`, `identity-sql-check`, `pnpm lint` |

**The last mile cost more than the estimate twice, and both misses are worth keeping.**
The first: `shell.inputs` decides what MOUNTS, so unlike `seeds` it cannot be deferred
— async `inputs` forces async `build()` forces async `session()`, ~40 files across
three apps. The second: `grep` for `shells.session`, `login` and `personByEmail` found
the call sites but not `server/functions/nav.ts`, which resolved catalogs with
`resolveCatalog(app, principal)` and so quietly lost an integration's menu entry while its
screens still existed. A blast radius measured by grepping for the names you already
know is a blast radius measured wrong.

**And `adopt` had to re-resolve.** A shell is the long-lived thing here; the install
list it was born with is precisely what must not be trusted when a tenant installs a
integration. It re-resolves asynchronously and unawaited now, the same progressive path
`seeds` takes.

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
   this is a **correctness bug, not a scaling concern** — an integration installed via
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
| [`server/users.ts`](../../apps/lab/lyra/src/server/users.ts) | `DIRECTORY` (:19), `TIMEZONES` (:22), `COUNTRIES` (:24), `LOCALES` (:27), `BY_EMAIL` (:28), `INSTALLED` (:55), **`AUTOMATION`**, **`DAY_FORMAT`** | `loadDirectory` |
| [`server/themes.ts`](../../apps/lab/lyra/src/server/themes.ts) | `BY_STUDIO` (:8) | `loadThemes` (:10) |
| [`server/phrases.ts`](../../apps/lab/lyra/src/server/phrases.ts) | `BY_LOCALE` (:23) | `loadPhrases` (:25) |

**Ten, not eight** — batch 1 added two, deliberately, and they are counted here
rather than left to be discovered: `AUTOMATION` (row-backed, replaces a per-effect
population scan, dies with the file in 7.3 step 8) and `DAY_FORMAT` (a memo over
IANA timezone strings, *not* row-backed, and the one entry in this table that
should outlive the plan — see 8.2 and D9).

Three files, one pattern: `loadX(pool)` writes module state,
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
| **`refresh()` never clears `reachPolicies`** — it drops `policies`, `catalogs` and `variantBindings` and leaves the fourth map standing, so every reach-scoped policy is stale for the process lifetime after an approval or a role change | [`server.ts:917`](../../packages/moss/src/server.ts#L917) vs [`server.ts:130`](../../packages/moss/src/server.ts#L130) |

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
The interim is an explicit `invalidate(principal)` plus a **generation counter
row**, read on the `sessionRevalidateMs` tick moss already runs, so every process
hears it. (This replaces an earlier recommendation of Postgres `LISTEN/NOTIFY` —
see Part 12.2 for why that was wrong.) Move 4 subsumes both. Note
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
| Move the anonymous roster behind the dev-transport flag — **not** simply delete it; the roster leak and the click-to-login test affordance are one code path (Part 12.1). Lands with the mail work, not before. | [`app.ts:340`](../../apps/lab/lyra/src/app/app.ts#L340) |
| Cache the per-studio `Intl.DateTimeFormat` | [`users.ts:151`](../../apps/lab/lyra/src/server/users.ts#L151), :161 |
| Clear `reachPolicies` in `refresh()` — the fourth memo map is skipped | [`server.ts:917`](../../packages/moss/src/server.ts#L917) |
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
5. Add `invalidateIdentity` and the generation counter, read on the existing
   `sessionRevalidateMs` tick. This closes the two-process correctness bug.
6. **Take the memo key off the request path.** Batch 2 re-keyed the four memos by
   `memoKeyOf` = (roles ⊕ installed), which is correct and bounded — but it made
   `getPolicy` and `getPolicyForReach` recompute that key on **every request**,
   including a call into the app's `installedIntegrations` seam, an array copy, a
   sort and two joins. That replaced an O(1) `Map.get` with an allocation per
   request. It is a real regression, it is live now, and **it does not disappear
   on its own when the identity seam lands** — the seam removes it only if the
   key is read off the resolved identity record instead of being recomputed.
   Written as its own step because a step that is merely implied is a step that
   does not happen.

   **Acceptance criterion, assertable rather than asserted:** a check that
   installs a counting `installedIntegrations` seam, drives N authenticated
   requests through one session, and fails unless the seam was called **once**.
   Goes in `all-checks.ts` with the Part 8.3 set.

### 7.2 — moss: the wire, everywhere

6. Make `shell.inputs` async and give it the wire, matching `seeds`.
7. Move `integrationActor` to the wire-bearing signature.

### 7.3 — lyra: migrate onto the seams

8. Implement `identity` over the wire. Delete `DIRECTORY`, `BY_EMAIL`, `INSTALLED`
   and **`AUTOMATION`** — named explicitly because an unnamed cache survives a
   step that lists its neighbours, and because deleting it is also where the
   automation principal unifies on the synthetic id (12.4). **`DAY_FORMAT` is not
   on this list** and must be rehomed rather than deleted (D9).
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
- **bounded memos over an authored key space** (a fourth kind, found while
  building batch 1 and not in the original three): `DAY_FORMAT` holds one
  `Intl.DateTimeFormat` per IANA timezone. It is module-level and mutable, so the
  ESLint rule in 8.1 flags it and so does the discriminator below — but it is
  neither row-backed nor a defect. Its key space is bounded by a standard rather
  than by the population, and dropping it loses nothing (invariant 3 holds).
  Without this category the census either flags a legitimate memo or the rule is
  weakened to let real ones through.

The honest discriminator is *assigned from a query result*, mechanically
detectable on the AST the census already walks — which is exactly why the fourth
category above is needed: `DAY_FORMAT` is assigned from an **argument**, not a
row, and that distinction is the whole rule.

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

Each carries a **recommended** answer and the evidence for it. Recommendations
are not ratifications — a human still says yes. Where the recommendation was
reached by reading code rather than by preference, the citation is the argument.

| # | Decision | Recommended answer | Status |
|---|---|---|---|
| **D1** | **Session lifetime vs. mid-session role change.** If identity resolves once per session, what invalidates it, and what may a stale principal do in the window? | **Per session; invalidation is `shells.reset(principal)`, which already exists and is already the answer** for a role change ([`world.ts:73`](../../apps/lab/lyra/src/server/functions/world.ts#L73)) and a language change ([`world.ts:120`](../../apps/lab/lyra/src/server/functions/world.ts#L120)). The identity entry dies with the shell. Stale window = `sessionRevalidateMs` (60 s default) — the same window a live socket credential already carries ([`runtime.ts:29`](../../packages/moss/src/runtime.ts#L29)), so this adds no new exposure class. No new mechanism. | **ratified 2026-08-13** — gates 7.1–7.3 |
| **D2** | **Who declares `wearable`?** The app, or derived from the charter? | **The app, as a list of role combinations.** Settled by the two consumers: [`verify.ts:154`](../../packages/charter/src/verify.ts#L154) flattens `assignments` to a role *set*, and [`principal.ts:106`](../../packages/moss/src/principal.ts#L106) builds one wearer per distinct *combination* — naming the principal only for the error string. Neither wants principals. The charter can enumerate single roles; it cannot know `['instructor','member']` exists, because that is a schema fact (a `staff` row **and** a `studio_people` row, [`users.ts:47`](../../apps/lab/lyra/src/server/users.ts#L47)). ~12 authored entries for Lyra. | **ratified 2026-08-13** |
| **D3** | **Does `scope` stay per-request or become per-session?** Per-request today ([`server.ts:250`](../../packages/moss/src/server.ts#L250)). | **Per-session — this is D1, not a second question.** Per-request is free today only because it is O(1) map hits; async + wire makes per-request a round trip per request, so the signature change forces per-session on its own. | **folded into D1** |
| **D4** | **Bootstrap policy — build it, or pin the SQL instead?** | **Pin the SQL (option b).** A bootstrap policy relocates the exception from a FILE into a VALUE, and values get passed to the wrong caller; the file cannot be. Its failure mode is silent until exploited and its blast radius is total, because every tenant boundary here is engine-side. The benefit that actually mattered was auditability, and a check delivers that: [`identity-sql-check.ts`](../../apps/lab/lyra/src/dev/identity-sql-check.ts) pins five tables, no splicing, one row by key, and **executes the queries against the live schema** — which recovers most of the boot-time validation a declared entry would have given. | **ratified 2026-08-13 — option (b) built** |
| **D5** | **Are `dev/` checks held to rule 16?** 95 of 132 type assertions live there. | **No.** Holding checks to it buys nothing and triples the 7.5 backlog. | **ratified 2026-08-13** |
| **D6** | **Multi-studio identity** (Part 2.4). One principal per (person, studio)? | **Defer, but fence it now:** a check that fails when a principal resolves to a studio whose `studio_people` does not know them, so the latent hazard cannot land silently while the decision waits. | **deferred, fenced** |
| **D7** | **Census scope** — lyra-only, or promoted to a shared tool? | **Lyra-only**, said explicitly. Atrium and relay are demos and stay outside. | **ratified 2026-08-13** |
| **D9** | ~~**Where does `DAY_FORMAT` live once `users.ts` is gone?**~~ **Resolved:** [`server/clock.ts`](../../apps/lab/lyra/src/server/clock.ts) — its own file, and `identity.ts` now takes the clock from there rather than from the directory it replaced. It lived in `users.ts` only because that is where the timezone map happened to be, which is the same accident that grew `Directory` to thirteen methods. | **ratified 2026-08-13** |
| ~~D9 (original)~~ | **Where does `DAY_FORMAT` live once `users.ts` is gone?** The formatter memo is legitimate (8.2, fourth category) and survives the file that currently holds it. Options: beside whatever owns `studioToday` after 7.3; or a declared prism/format concern; or moss, since every multi-tenant app has this exact need. | **open** — small, but it is the one piece of batch-1 state with no scheduled home, and unowned state is how this class returns |
| **D8** | **The red-on-day-one backlog.** One decision per violation, or a baseline? | **Clean, not a baseline.** 134 rule-16 breaks and 140 unnamed lines. `phrases.ts` was written by somebody who had already read the `users.ts` post-mortem — a baseline is exactly how that recurs. | **ratified 2026-08-13** |

---

## Part 10 — what "done" looks like

- [`apps/lab/lyra/src/server/users.ts`](../../apps/lab/lyra/src/server/users.ts)
  does not exist. Neither does module state in `themes.ts` or `phrases.ts`.
- `grep -r "everyone()" apps/lab/lyra/src --include=*.ts` returns nothing outside
  `dev/`. Five production callers today.
- No unauthenticated request can obtain more than one person's row.
- Two processes serving the same database agree about installed integrations, roles and
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
  indefinitely.** The interim generation counter must be written as interim and
  recorded as such — though unlike `LISTEN/NOTIFY` it converges on Move 4's
  design rather than away from it (Part 12.2).

---

## Part 12 — amendments on review (2026-08-13)

### 12.1 Lyra is pre-production, and the dev login is a feature

An earlier draft of this review treated Lyra's auth surface as a defect: `auth.enter`
takes an email, checks the person exists, and mints a session with no password and
no verified link ([`auth.ts:17`](../../apps/lab/lyra/src/server/functions/auth.ts#L17));
`auth.request` `console.log`s the link ([`auth.ts:12`](../../apps/lab/lyra/src/server/functions/auth.ts#L12)).

That framing was wrong. Lyra is **not yet in production**, and click-to-login as
different principals is worth real money in testing. The finding that survives is
narrower and more useful:

**The roster leak and the test affordance are the same code path.** The anonymous
branch of `shell.inputs` returns `directory.everyone()`
([`app.ts:334`](../../apps/lab/lyra/src/app/app.ts#L334)) — the roster *is* the login
screen. Deleting it, as 7.0 originally said, kills the test workflow. That is why
that row now reads *move behind the dev-transport flag*.

The split, which invents nothing — moss already names `runtime.session` as the auth
seam, *"real auth replaces that one function"*
([`runtime.ts:8`](../../packages/moss/src/runtime.ts#L8)), and it is already
async-capable ([`runtime.ts:15`](../../packages/moss/src/runtime.ts#L15)) and already
awaited ([`server.ts:208`](../../packages/moss/src/server.ts#L208)):

| Stage | Production | Dev | Shared |
|---|---|---|---|
| resolve email → person | declared vex point read (`people/byEmail` already exists, [`intake.entries.ts:80`](../../apps/lab/lyra/src/app/vex/intake.entries.ts#L80)) | same | ✅ |
| mint short-lived single-use token | same | same | ✅ |
| **deliver the token** | mail integration | console line / picker click | ❌ — the only fork |
| `?token=` → `session.grant` | same | same | ✅ |

Selecting the transport is a runtime knob, which is where moss already argues this
class of decision belongs: *"an operational decision about a deployment, not
something an application is written against"*
([`runtime.ts:18`](../../packages/moss/src/runtime.ts#L18)). Flag off → anonymous
`inputs` carries zero person rows, asserted by a check in the house style. Flag on →
the picker, and a click mints the token the mail would have carried.

**Payoff beyond the leak:** the ~14 `dev/` files that address principals by importing
`personByEmail` out of module state ([`acl-check.ts:4`](../../apps/lab/lyra/src/dev/acl-check.ts#L4),
plus roles, reachable, visibility, shell, course, integrations, roundtrip, world and
both benches) can move onto that surface — the same path a human tester uses, instead
of reaching into `server/` and bypassing the session boundary as they do today. This
converts 7.3's largest unbudgeted cost into a benefit.

**Corollary for the mail work in flight: auth mail is not an integration.** The send happens
*before* a principal exists — there is an address, not a person, so there is no tenant
to resolve an install against; a studio uninstalling it would lock its own users out;
and routing it through `installedIntegrations`/`integrationActor` would couple the
login path to two of the six seams 7.1–7.2 is migrating. Tenant-configurable *sender
identity* is a legitimate integration concern; delivery is platform infrastructure.

### 12.2 Reversed: no `LISTEN/NOTIFY`

The interim invalidation channel is a **generation counter row**, read on the
`sessionRevalidateMs` tick moss already runs — not Postgres `LISTEN/NOTIFY`.

- `NiscRuntime` takes a `PgPool` and a `MutationClient`
  ([`runtime.ts:11`](../../packages/moss/src/runtime.ts#L11)), deliberately abstract.
  `LISTEN` needs a raw dedicated connection held outside the pool: a new capability at
  the environment boundary, for one feature.
- Its failure mode is **silent**. A dropped listener stops invalidating and nothing
  says so — invariant 6 ("breaks rather than degrades") violated by the fix for
  invariant 6.
- A counter converges on Move 4 instead of being thrown away by it. *"Other processes
  observe a pointer move"* ([DESIGN.md:56](../../packages/moss/DESIGN.md#L56)) **is** a
  generation counter.

Cost: staleness bounded by a clock already being tuned, rather than arriving instantly.
Today it is bounded by nothing.

### 12.3 Two findings not in the original plan

1. **`refresh()` leaks stale reach policies.**
   [`server.ts:917`](../../packages/moss/src/server.ts#L917) clears `policies`,
   `catalogs` and `variantBindings` — and skips `reachPolicies`
   ([`server.ts:130`](../../packages/moss/src/server.ts#L130)). After an integration
   approval or a role change, every reach-scoped policy stays stale for the process
   lifetime. One line, live today, in batch 1.
2. **`assignments` never needed to be an eager `Record`.** Neither consumer wants
   principals; both want role *combinations* (see D2). That is the whole reason the
   seam is eager, and it is why D2's answer is an authored constant rather than a
   redesign.

### 12.4 The automation principal

`tokenFor` scans the population per effect
([`tide.ts:17`](../../apps/lab/lyra/src/server/tide.ts#L17)) because the automation
*principal* is a `people` row id while the automation *actor* is the synthetic
`automation@<studioId>` ([`app.ts:147`](../../apps/lab/lyra/src/app/app.ts#L147)).
They are two names for one thing.

Preferred fix is to unify them on the synthetic id — the same construction integration
actors already get ([`users.ts:124`](../../apps/lab/lyra/src/server/users.ts#L124)) —
which deletes the scan outright and makes `scope.automationActor` *be* the principal.

**Checked, and deferred to batch 3.** The automation principals are real `people` rows
(`p_auto_lumen`, `p_auto_northrock`, seeded with `staff` rows at role `automation`),
and `people(id)` is a foreign-key target from roughly fifteen tables. Re-pointing the
principal at a synthetic id also means synthesizing its directory entry *and* its
`assignments` rung, or every automation call compiles an empty policy and 403s — which
is the identity rework itself, not a standalone defect fix.

**Batch 1 therefore took the narrower branch:** the per-studio automation principal is
derived in the pass `loadDirectory` already makes over every row, beside `TIMEZONES`,
`COUNTRIES` and `LOCALES`, and `tide` reads it as `automationFor(studioId)`. That
deletes the per-effect population scan and removes `everyone()` from `tide.ts`
altogether — one of the five production callers Part 10 wants gone — without touching
seed data or identity semantics. The unification stands as the batch-3 endpoint.

### 12.5 Build batches

| Batch | Contents | Needs |
|---|---|---|
| **1** | 7.0's decision-free defects + the `reachPolicies` fix (12.3). The anonymous-roster row is **not** here — it lands with the mail work per 12.1. | nothing |
| **2** | `wearable` in charter; re-key moss's four memos by (roles ⊕ installed); the `identity` seam with bound, eviction, revalidation and roster from the first commit; the generation counter. Then `shell.inputs` and `integrationActor` onto the wire — the latter is already called from async middleware ([`server.ts:201`](../../packages/moss/src/server.ts#L201)), so it is nearly free. | D1, D2 |

**Batch 2 progress (2026-08-13).** Landed: `wearable` (D2) — `verifyCharter`'s third
parameter is now the combinations rather than the assignment map, `verifyVariants`
reads `wearableOf(app)`, and Lyra declares thirteen combinations instead of deriving
six hundred thousand; the four memo maps are re-keyed by `memoKeyOf` = (role
combination ⊕ installed set), collapsing them from O(principals) to ~10 entries;
`integrationActor` is widened to `string | null | Promise<string | null>` and awaited
— the first of the six synchronous seams to stop being synchronous.

**Also landed:** the `identity` seam is declared on `NiscApp`, its cache is built
([`identity.ts`](../../packages/moss/src/identity.ts): bounded, LRU-evicted,
revalidated on `sessionRevalidateMs`, metered, operator-rostered, in-flight
deduplicated, failures uncached), the runtime knobs exist (`identityMax`,
`identityIdleMs`), and **the request path is rerouted**: identity resolves ONCE in
the auth middleware and rides the request as `Resolved`, which closes 7.1 step 6 —
`getScope`, `getPolicy` and `getPolicyForReach` now read a record instead of
re-asking three seams and re-deriving a memo key per request. The key itself is
derived once per record through a `WeakMap`. Applications that have not declared
`identity` fall through `fromSeams` to the old behaviour unchanged, which is what
keeps atrium, relay and lyra-admin green.

**Still open in batch 2:** the generation counter, and `shell.inputs` onto the wire.
Two notes for whoever picks this up:

- `integrationActor` took only the ASYNC half of 7.2 step 7. The wire-bearing half
  needs the bootstrap policy, because that seam runs before a principal exists —
  **D4**, still open. 7.2 step 7 is two steps.
- The shell host and the contract-fingerprint surface deliberately still call
  `fromSeams`. Both are per-SESSION rather than per-request, so they cost nothing
  now — but both read `app.assignments`, so both must move before 7.3 deletes it.
**Batch 3 slice 1 landed (2026-08-13): Lyra declares `identity`.** Verified at *all
39 checks pass*. The seam returns roles, installed ids and the stable scope values;
moss holds the record for the session. Four things came out of building it that the
plan did not anticipate:

1. **The clock had to be split out of scope.** `today` and `horizon` were per-request
   because `scope` was; folding them into a per-session record would have frozen them,
   and a session opened at 23:58 would tell every read it was yesterday — including
   the ones the database compares a `DATE` column against. So `scope` survives beside
   `identity` as the VOLATILE half, asked per request, and is handed the resolved
   record so the day can be computed from a fact the session already holds. It stays
   synchronous on purpose: a sync seam is only a trap when the answer lives in rows.
2. **Roles must come off the principal id, not the directory row.** An actor for a
   integration installed after boot has no row yet, and reading roles from a missing row put
   a payments integration on the member rung — which reads nothing and refuses quietly.
   Also: an unknown principal wears `public`, never `member`.
3. **`refresh()` must drop identity too.** Dropping the compiled policies while
   keeping the records they were compiled from keeps the stale half: a promoted
   instructor held their old rung until the record expired on its own clock. Caught by
   `acl-check`, which is exactly what that check is for.
4. **There were four spellings of "compose this principal's scope values"** — one at
   the vex mount and three around the integration surfaces. Lyra's `scope` shrinking
   to two keys silently emptied the assertion an integration receives, so a proxied call
   answered about nobody. Now one `composeScope`, used everywhere. This is the
   `everyone()` lesson again in a different costume: a derivation spelled more than
   once will disagree with itself, and the disagreement will be silent.

**7.1 step 6's acceptance criterion is now asserted**, not promised:
[`identity-check.ts`](../../apps/lab/lyra/src/dev/identity-check.ts) drives eight
requests through one session and fails unless the seam was asked **once** — read off
`server.identities.meter()`, so the check sees what an operator would see. It also
asserts invariant 3 (drop it, get the identical answer back for one re-resolution)
and invariant 1 (the roster carries `principal/since/lastSeen` and no records).

**Batch 3 slice 2 landed (2026-08-13): the seam reads a row.**
[`server/identity.ts`](../../apps/lab/lyra/src/server/identity.ts) resolves one
principal with one query — person, studio, staff role, anchor and installs together —
and the request path no longer touches `DIRECTORY` at all. This is exactly the surface
Part 4 licenses and nothing more: `principal → { roles, scope values }`, for the one
principal asking.

Three things worth recording:

- **The zone travels, the day does not.** The record carries `timezone`; `clockScope`
  derives `today` and `horizon` from it per request. So the volatile half needs no
  lookup and no cache — which is what lets `studioToday`'s resident `TIMEZONES` map
  leave the request path entirely.
- **Integration actors resolve without a row.** `ig_<integration>@<studio>` is parsed, the
  install is verified against `studio_integrations`, and the rung comes off the id.
  The install IS the credential's lifetime — uninstalling revokes the actor, with no
  second mechanism to forget.
- **An unresolvable principal is `public`.** Not `member`, which is a working
  application. A token that verifies for somebody this deployment cannot resolve
  lands on the lock screen.

**Batch 4 landed: held state is classified, and the rule gates.**
[`held-state-check.ts`](../../apps/lab/lyra/src/dev/held-state-check.ts) walks the
AST for module-level bindings and sorts them into the four kinds of 8.2, failing on
any row-backed cache not named in a list somebody has to shorten on purpose. It
found nine, all scheduled.

Its self-test caught three bugs in its own rule before it ran on the tree, which is
the entire argument for writing them:

1. Matching only `=` missed `??=` — every memo in this codebase is written that
   way, so the rule found no writes and filed a formatter cache as inert data.
2. "Assigned inside a function that queries" condemned `boot.ts`'s driver
   singleton, which sits in a function that happens to query. The discriminator the
   plan names is *assigned FROM a query result*, so the VALUE has to be traced.
3. Worst: the first draft missed `DIRECTORY` — **the canonical example**.
   `loadDirectory` fills a plain local in a loop and publishes it in one statement
   that mentions no row at all. A rule tested only against the obvious spelling
   passes while the thing it was written for sits three lines away.

**The generation counter landed with it** ([`generation.ts`](../../packages/moss/src/generation.ts)),
so 7.1 step 5 is closed: `refresh()` moves the pointer, every other process drops
its derivations within one poll, and a pointer that cannot be READ says so loudly —
which was the whole reason for choosing it over `LISTEN/NOTIFY`. Asserted in
`generation.test.ts`, including that a process does not react to its own bump and
that a quiet interval is not a move.

**Still open:** the caches themselves. `DIRECTORY`, `BY_EMAIL`, `INSTALLED` and
`AUTOMATION` are now unused by the request path but still feed `assignments`, the
anonymous login picker and ~14 `dev/` files — that is the deletion slice, and it wants
the shell host and contract surfaces off `fromSeams` first, since both still read
`app.assignments`. Then Move 2 (declared entry + bootstrap policy, **D4**), the
generation counter, and `shell.inputs` onto the wire.
| **3** | Lyra migrates: delete `DIRECTORY`, `BY_EMAIL`, `INSTALLED`, and the module state in `themes.ts` and `phrases.ts`; move the ~14 `dev/` files off `personByEmail`; convert `assignments` in atrium, atrium/admin and lyra-admin. `users.ts` shrinks to the login path and dies when the mail work lands. | D1, D2 |
| **4** | ESLint; the census `edgeOf` rewrite plus held-state detection; `census` into `all-checks.ts`; the four invariant checks of Part 8.3 with falsifiable self-tests. | D5, D7, D8 |
