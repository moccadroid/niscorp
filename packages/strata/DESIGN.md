# strata — design

Why it is shaped the way it is. The build plan lives in
[docs/plans/versioning.md](../../docs/plans/versioning.md); this is what was
decided and why, kept beside the code.

## The problem it was built for

Every nisc artifact is JSON with a schema, and those artifacts are already
stored — `integration_actions.definition`, `vex_cache.dsl` and `prism_ir`,
atrium's bundles, lyra's theme layouts. Nothing recorded which grammar wrote
them. Underneath that, three packages created and altered their own tables on
every boot with `IF NOT EXISTS`, outside any ledger: moss added twelve columns
that way, tide dropped three. A deployment could not say what shape it was in,
and a later change had nowhere to go but another `IF NOT EXISTS`.

strata is one path for both: the tables a database holds, and (next) the
documents stored in them and written in source files.

## Decisions

**Sequences per owner, versions by position.** tldraw's model: an append-only
list per owner, a version that is a count. A hand-bumped integer is a second
source of truth beside the list; a count cannot disagree with it. Owners are
namespaced so a package and an app never collide, and Kubernetes' lesson on
granularity applies — one sequence per *owner*, not per table and not one for
the world.

**One ledger for everyone.** Django's model: every package ships its own
migrations into the app's single ledger, ordered by the order given and bent by
explicit `dependsOn`. The order is deterministic — tldraw rebuilt its migration
system after ordering across sequences drifted between releases.

**Checksum the effect, not the prose.** The ledger stores a SHA-256 of each
migration's steps. Descriptions, `dependsOn` and full-line SQL comments are
excluded: rewording documentation is not editing history. Changing a step is —
the database already holds the old effect — and is refused (`EDITED`).

**Refuse, don't guess.** A database migrated by newer code (`TOO_NEW`), a hole
in the ledger, an unknown dependency, a cycle: each is a refusal with a
sentence, never a best effort. Verify mode refuses pending work, so a
production boot can require that a deploy step migrated first.

**One transaction, one lock.** A run takes `pg_advisory_xact_lock` on the
ledger's name, then creates the ledger if needed, reads it, plans and applies —
all in one transaction. Postgres DDL is transactional, so a failed step leaves
nothing behind. The lock comes first because two processes creating the ledger
at once race in the catalog before either reaches a row.

**Pure core, structural pool.** The plan is a pure function of sequences and
ledger rows; the runner is the only thing that touches a database, through the
`{ query, transaction }` shape nisc already passes everywhere. So the same code
runs in a server, a test and the showroom page (PGlite in the browser), and
checksums use WebCrypto rather than a Node module.

**Baselines converge.** Each package's first migration is exactly the
`IF NOT EXISTS` DDL its boot used to run. That makes adoption free: whatever
earlier shape a deployment is in, migration 1 lands the current one, keeps the
rows, and is recorded. No schema diffing, no "mark as applied" step that
assumes. Every package pins its baselines' checksums in a test, so an edit is
caught in CI rather than by a refusing production boot.

## What moved when strata landed

moss's server now runs `nisc.moss` (integrations, their actions, the generation
pointer), `nisc.moss.sessions` (when the deployment uses moss's credential) and
the vex cache's sequence in one run, **before** introspection — as the tables
it replaced were. Two consequences, named rather than discovered later:

- The generation table used to be created *after* introspection; it is now
  created before, and `strata_ledger` is a new table. Both enter the
  introspected grant universe like every engine table (moss's stance: engine
  tables are ordinary and grantable, and a grant is a charter's decision). A
  charter selecting `*.read` — relay's viewer does — now also reaches them.
  The ledger holds migration descriptions and checksums; the generation table
  a counter.
- `initIntegrations`, `initSessions`, `cache.init()` and the tide store's
  `migrate` keep their names and now go through the ledger, so a host that is
  not moss's server gets the same guarantees.

## Next

Document steps with an injected Prism evaluator, embeddings (where one grammar
nests inside another), stamps on stored rows, the snapshot + corpus check, and
`upgrade --verify` for source artifacts — stages S2–S5 of the plan.
