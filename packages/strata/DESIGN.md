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

strata is one path for both: the documents stored in databases and written in
source files, and the tables a database holds.

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
  charter selecting `*.read` reached them — and, it turned out, had always
  reached moss's `integrations` (integration key hashes). relay's charter check
  resolved against relay's tables only, so it never showed. Fixed in relay: the
  check builds the universe the way boot does, and `*.read` roles deny the
  engine's tables. Any app granting a data wildcard should do the same.
- `initIntegrations`, `initSessions`, `cache.init()` and the tide store's
  `migrate` keep their names and now go through the ledger, so a host that is
  not moss's server gets the same guarantees.

## Documents (S2)

**Two kinds of owner.** Tables live in one database, so their version is the
database's — a ledger. Documents travel: an add-on built on older code submits
older documents, a row written by one replica is read by another, an artifact
sits in a repo for a year. Their version has to travel with them — a stamp per
document. A sequence owns one or the other; the same number cannot mean both.

**Version vector, not one number.** tldraw's answer to nested, pluggable
formats: the stamp names every grammar the writer spoke (`nisc.nova`,
`nisc.prism`, the app's `acme.kit`), so a kit's props and nova's layout evolve on
their own schedules and nothing composes by hand.

**The grammar owns the nesting; the migration owns one node.** Embedding paths
are the grammar's declaration of where documents sit inside documents. The
walker applies each step to every document of its kind, deepest first, re-reading
each node from the current document so a parent sees — and keeps — its children
already rewritten (the first implementation captured targets up front and wrote
stale parents over rewritten children; a test caught it). The consequence is
the useful one: a migration is flat. The relay rename that needed 22.5 KB of
unrolled Prism as a whole-tree transform is a dozen lines as a per-node one, and
Prism needs no recursion of its own for anything a grammar's embeddings describe.

**Two wildcards.** `*` crosses a record's values, `[]` an array's items. nova's
`children` is a single node or an array; one wildcard for both would treat a
lone child's `props` as a record of layouts.

**Injected transform.** strata knows nothing of Prism: a document step's
`transform` is opaque data run by the evaluator the host injects — nova's own
socket shape, `(config, source) => unknown`. moss injects Prism, so a
migration runs through the engine that runs endpoints, with the same guarantee
that no code executes. That is what makes a third party's migration safe to run.

**Refuse ahead, upgrade behind.** Strict grammars make every addition break
older readers, so a document ahead of the code on any grammar is `TOO_NEW` — at
boot a refusal to start, at intake "the host must be updated first", on a read
path the one action left out with a sentence. The reader upgrades first.

**Not every table of documents is a store.** `vex_cache` holds DSL and compiled
Prism IR, but its protected rows are re-seeded from source on every boot and its
generated rows are a cache invalidated by schema fingerprint and `irVersion`. It
is not stamped: there is nothing there to preserve across a grammar change.
`integration_actions` is — its rows are the only copy of what an add-on submitted.

## Prism as the migration language (S3)

**Why Prism, not a second grammar.** Cambria proved migrations-as-data with a
closed lens vocabulary, but nisc already has one transform language (the
toolbox: Prism is "every transform"), and a second would be a second thing to
version. Prism gained what migrations need — `$has` (presence, not
non-null-ness), `$renameKeys` (order kept), `$update` (one deep path),
`$assert` (refuse with a sentence), `$walk` (rules over every node) — and a
config stays data: stored as a row, run in any host, safe when a third party
wrote it.

**The walker made `$walk` rarer than expected.** Embeddings already find every
document of a kind at any depth, so most migrations are a flat rule over one
node. `$walk` is for what a grammar's embeddings do not describe: reaching
inside a Prism config, or a free-form tree.

**A migration cannot migrate the language it is written in.** So the base case
is a rule, not a mechanism: a Prism op is never removed or reshaped; an old form
stays as sugar. `EVERY_OP_EVER` in Prism's tests fails on a removal.
`irVersion` stays 1 — it versions the IR's container; the op set is versioned by
`nisc.prism`.

## The gate (S4)

**A snapshot only says something moved.** Each kind's JSON Schema, taken through
the schema's own Standard JSON Schema hook, recorded per version as the
validator wrote it. Same version, different schema: a migration is owed. No
JSON Schema compatibility classifier is trusted to judge — none is reliable
(2026).

**The comparison ignores prose and spelling, the record keeps both.** Before
comparing, both sides lose the `description` keyword (a reworded `.describe()`
is not a grammar change — but a field named `description` is) and are read in
one spelling: definitions inlined unless recursive, `allOf: [{ $ref }]` as
`$ref`, a union of bare types as a type list. zod 4.3 → 4.6 respelled both nisc
grammars without changing either; that must not be a migration. Keeping the
normalizing out of the record means strata can refine it without touching a
recorded file.

**A snapshot is a fingerprint, not history.** The grammar version is history —
its migrations and the documents captured at its stamp. The snapshot is what a
RECORDER (the validator, then strata) made of it, and a recorder can be wrong
or improve: zod 4.3 described Prism's tuples as open, and strata once dropped a
field named `description`. Then the current version is re-recorded —
`pnpm strata:snapshot --rebaseline`, refused unless the corpus passes, in a
commit that changes nothing else in the grammar. Not a marker migration: that
would bump every app's lock and every stored stamp to say nothing happened.

**The corpus judges.** Real documents from the lab apps, captured at their
stamp, must upgrade to the current grammars and parse the current strict
schemas. That is what caught a breaking rename in the rehearsal: 122 real
documents would have failed. An early-stamp corpus file is history.

**Arrays in schemas are sets.** A union's `anyOf` gains a branch and every index
shifts, so the gate's diff matches schema-array elements by what they describe
(for Prism's union, the op) — its first real catch, Prism's own grammar change,
read like a changelog because of it. Document diffs stay positional:
`layout.children[1]` is how a person finds the edit.

## Source (S5)

**No codemods.** A codemod would have to understand every way a person writes
an object. strata instead fixes the TARGET: the exact JSON each artifact must
become, and a report of where (the file its id is in, and — found by searching
the source for the values that change — the file the edit actually lives in,
usually an imported layout).

**Verify is exact, and it is the only way the lock moves.** Every planned
artifact equals its expected JSON (key order aside — that is how a person
happened to write it), every untouched one is still one no migration would
change, nothing was added or removed since the plan. A person, an agent, a
script — anyone may edit; the check does not trust any of them. A migration
whose result fails the current schema stops the plan: no edit could pass.

**The lock is the truth, not a formality.** The lab apps' locks were written at
`nisc.prism 0` — their source predated the marker — and moved through the loop.
`init` exists only for a source that never had one.

## Open

npm publishing (every package ships its first version with this in it);
lyceum and midas capture their own corpus and keep their own locks.
