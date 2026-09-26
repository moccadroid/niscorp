# Versioning, migrations and strata

> **Status (2026-09-26): package side built; strata S0 + S1 built.** Built:
> Apache-2.0, consumable manifests, the zod peer + cross-copy check, nisc
> packages as peers, changesets + `@niscorp/nisc` + the breaking-dependents
> gate, the moss wire protocol version, golden credential hashes, Prism stored-IR
> speed + the `$const` fix — and **strata S0 + S1**: the package, the ledger,
> SQL steps, and every table vex and moss own moved into ledgered sequences
> (no package runs un-ledgered DDL any more), with the showroom's *The ledger*
> and *Adopt an old database* stories. **Next: S2** (document steps,
> embeddings, stamped rows). **npm publishing is blocked until S1–S4 land**
> (decided).

Two problems, one plan. **Package versioning**: ten libraries with no version
discipline, never published. **Data versioning**: every nisc artifact is JSON
with a schema, artifacts are already stored as jsonb rows
(`integration_actions.definition`, `vex_cache.dsl` + `prism_ir`, atrium's
bundles, lyra's theme layouts, relay's actions) — and nothing records which
grammar wrote them.

## 1. Decisions

| # | Decision | Tier |
|---|---|---|
| D1 | Every `@niscorp` package versions independently (each is a standalone library — no "external vs platform" split). `@niscorp/nisc` pins the exact compatible set. | answered |
| D2 | Changesets. Below 1.0 a minor is breaking; a breaking release breaks everything that depends or peers on it. | answered |
| D3 | License: Apache-2.0 everywhere. | answered |
| D4 | zod is a required peer, **floor 4.2.0**, everywhere. Caller schemas convert through their own copy (`~standard.jsonSchema`). | answered |
| D5 | nisc packages meet as peers; a plain nisc→nisc dependency needs an allowlisted reason. | answered |
| D6 | Packages never run DDL at runtime. One ledgered migration path. | answered |
| D7 | Format versioning: per-namespace sequences, version = length, vector stamped only where skew happens, up-only, BACKWARD-only. | answered |
| D8 | Migration language: Prism + new ops, plus a registered named code escape hatch. Prism ops are never removed or reshaped. | answered |
| D9 | Source artifacts: no codemods. `strata upgrade` writes the exact expected JSON; a human or agent edits; `--verify` proves equality. | answered |
| D10 | The migrations package is `@niscorp/strata`, public. | answered |
| D11 | midas is not touched from here; it adopts on its own schedule. | answered |
| D12 | npm publishing waits for strata S1–S4. | answered |

## 2. What is built

| Commit | What |
|---|---|
| `4cf286c` packages: consumable from outside the workspace | exports maps (CJS types), vex/hono optional peer, `/agent` subpaths' cortex as optional peer, `engines >=22.12`, `files` ship every doc, `scripts/check-packages.mts` |
| `dd1d0f0` zod | required peer `^4.2.0`; conversion through `~standard.jsonSchema`; second-zod scenario in the check |
| `076a8df` prism | stored IR rehydrated on first execute (1.5×–4.4× → parity); `$const` payloads are data |
| `5af8259` peers | moss/nova/vex/loom meet nisc packages as peers; check enforces |
| `34264be` release | changesets, `@niscorp/nisc`, `scripts/check-changesets.mts` |
| `80bd372` moss | `PROTOCOL`/`PROTOCOL_MIN`, close 4426, `incompatible` wire status; golden credential rows |

### Traps found on the way (keep)

- **zod < 4.1.13 loses descriptions across copies.** The registry moved onto
  `globalThis` in 4.1.13; before it, a schema from one copy converted by
  another silently drops every `.describe()`. 4.2.0 is the floor because it
  also brought `~standard.jsonSchema`.
- **Changesets ships a breaking peer move as a patch.** prism 0.1.0 → 0.2.0
  bumps moss 0.1.0 → 0.1.1 while its published peer range moves to `^0.2.0`.
  Same with and without `onlyUpdatePeerDependentsWhenOutOfRange`. Hence
  `check:changesets`.
- **Hoisting hides undeclared imports.** The pack smoke test needs
  `hoist=false`, or moss's own `hono` lets vex/hono resolve it.
- **Credential hashes are lookup keys.** Changing `sha256→hex` for session
  tokens or integration keys signs everyone out with no error. Pinned.

## 3. Package versioning, as it runs

```bash
pnpm changeset                # pick packages, pick the bump, write the changelog line
pnpm check:changesets         # a breaking release must break its dependents
pnpm changeset version        # bump, write CHANGELOG.md files
```

CI on a PR: `changeset status --since=origin/main` (a package change without a
changeset fails) and `check:changesets`. Push-to-main skips both.

The dependency rule (enforced by `check:packages`):

| | when |
|---|---|
| `dependencies` | used inside only — never in the published `.d.ts`, never authored by the app |
| required peer | crosses the API, or evaluates app-authored artifacts (zod, react, every nisc→nisc edge) |
| optional peer + devDependency | only one subpath uses it (`/agent`, `/hono`, loom's plugins) |

## 4. The data model (from the research — tldraw, Kubernetes, Django, Cambria, Stripe, Confluent)

- **A sequence per grammar owner**: `nisc.nova` (actions, layouts, fragments —
  one API group), `nisc.prism`, `nisc.vex`, `nisc.charter`, `nisc.moss` (its
  tables), and the app's own (`midas.kit` for component props, `midas.app` for
  its tables). Its version is its length: **you append, you never bump.**
- **A stamp is a vector** — `{ "nisc.nova": 7, "nisc.prism": 3, "midas.kit": 2 }`
  — written only where versions can differ: jsonb rows, add-on intake, the
  socket. Source files carry none (they are "current" of the installed packages).
- **Up-only, BACKWARD-only.** `.strict()` makes every addition break older
  readers, so the reader upgrades first (host before add-on, server before
  terminal), an addition appends an empty **marker** migration, and a document
  newer than the runtime is a typed `TOO_NEW`, never a Zod error.
- **The corpus is the judge**: every historic document at every historic stamp,
  migrated, must parse the current strict schema. Schema snapshots
  (`~standard.jsonSchema.input`) only *trigger* the requirement; no JSON Schema
  diff tool is trusted to classify compatibility.

## 5. strata

### What is new about it

None of the parts is new alone — tldraw has sequences and a version vector,
Cambria has migrations as data, Django has one ledger for every app's
migrations, Kubernetes rewrites stored objects, Stripe writes its changelog
from its version changes. What nobody has put together, and what nisc needs:

1. **One migration, three places.** The same step upgrades a jsonb row at boot,
   an add-on's submission at intake, and the TS artifact in the app's repo
   (through `upgrade --verify`). Everyone else migrates *either* the database
   *or* the documents, and source files not at all.
2. **Migrations are data.** A document step is a Prism config — it runs on the
   server, in a browser degrade app, inside an add-on; it can be stored as a
   row; it is safe to run when a third party supplies it (no code executes).
   Cambria proved the idea and never shipped; tldraw's migrations are code.
3. **Grammars nest and version independently.** A host grammar declares where
   another grammar sits inside it (**embeddings**). A Prism migration reaches
   the Prism config inside a nova endpoint inside an `integration_actions` row
   without nova knowing Prism migrations exist. tldraw's records are flat;
   Kubernetes versions a whole group at once.
4. **Nobody decides compatibility by hand.** The version is a count, the
   snapshot says *something* changed, the corpus says whether old documents
   survive. The only human act is writing the migration.
5. **An agent does the edit; a check proves it.** For source files the
   migration fixes the exact target JSON; the edit is anyone's; `--verify`
   is byte-for-byte.

### What it looks like (sketches — names and shapes open to change)

**A package ships its sequence.** Tables and documents in one list, one ledger.

```ts
// packages/vex/src/migrations.ts — exported as @niscorp/vex/migrations
import type { Sequence } from '@niscorp/strata';

export const vexSequence: Sequence = {
  id: 'nisc.vex',
  migrations: [
    { description: 'The cache table', steps: [{ kind: 'sql', sql: CACHE_TABLE_DDL }] },
    { description: 'Cache rows remember the request that minted them',
      steps: [{ kind: 'sql', sql: 'ALTER TABLE vex_cache ADD COLUMN request_hash text' }] },
  ],
};
```

Today those two lines run on every boot inside `cache.init()` as
`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`. Under strata they
run once, are recorded, and a deployment that is behind says so.

**A grammar declares its documents and what nests inside them.**

```ts
// packages/nova/src/migrations.ts — exported as @niscorp/nova/migrations
export const novaSequence: Sequence = {
  id: 'nisc.nova',
  documents: {
    action: {
      schema: ActionDefinitionSchema,
      embeds: {
        'layout': 'nisc.nova/layout',
        'endpoints.*.request': 'nisc.prism/config',
        'endpoints.*.response': 'nisc.prism/config',
      },
    },
    layout: { schema: LayoutNodeSchema, embeds: { 'children.*': 'nisc.nova/layout' } },
  },
  migrations: [
    // …
    { description: 'HTTP endpoints: body → request (a Prism config), transform → response',
      steps: [{ kind: 'document', at: 'nisc.nova/action', transform: '…a Prism config…' }] },
    { description: 'Marker: `optional` on slot nodes (an addition — older readers must refuse)',
      steps: [] },
  ],
};
```

**A document step is a Prism config.** The real relay rename from git history
(`af0d9b8`: state key `q` → `search` at every depth), with the proposed `$walk`:

```json
{
  "description": "Companies search box: state key q → search",
  "steps": [{
    "kind": "document", "at": "nisc.nova/action", "where": { "id": "companies.list" },
    "transform": { "$walk": { "over": { "$ref": "$" }, "as": "n", "rules": [
      { "when": { "$eq": [{ "$get": { "from": { "$var": "n" }, "path": ["ref"], "fallback": null } }, "q"] },
        "then": { "$merge": [{ "$var": "n" }, { "ref": "search" }] } },
      { "when": { "$eq": [{ "$var": "n" }, "$.q"] }, "then": "$.search" }
    ] } }
  }]
}
```

Today Prism cannot write that at all — it has no recursion; the test build
unrolled it into 22.5 KB of generated JSON. `$walk` is what S3 adds.

**A stamped row.**

```
integration_actions
 id              | definition (jsonb)  | grammar (jsonb)
 bookings.list   | { "id": …, … }      | { "nisc.nova": 7, "nisc.prism": 3, "midas.kit": 2 }
```

Read path: `upgrade(row.definition, row.grammar, sequences)` → the current
document, or `StrataError('TOO_NEW' | 'UNKNOWN_SEQUENCE' | 'STEP_FAILED', …)`.
Written back at current; a background pass rewrites the rest so old
migrations can one day be squashed.

**The ledger.**

```
strata_ledger
 sequence   | n  | description                                      | checksum | applied_at
 nisc.vex   | 1  | The cache table                                  | 3f9a0c…  | 2026-10-02 09:14
 nisc.vex   | 2  | Cache rows remember the request that minted them | 81d2e4…  | 2026-10-02 09:14
 nisc.moss  | 1  | Sessions                                         | c07b11…  | 2026-10-02 09:14
 midas.app  | 49 | Studios can close for a holiday                  | 5ae930…  | 2026-10-03 17:40
```

moss checks it at boot: pending migrations refuse the boot in production and
apply in the dev runtime. An edited, already-applied migration refuses too.

**CI when somebody changes a grammar.**

```
$ pnpm strata check
[fail] nisc.nova: ActionDefinition changed since nisc.nova/7 (strata/nisc.nova/7.json)
         + endpoints.*.retry   new optional field
       Append to packages/nova/src/migrations.ts — an empty marker is enough for
       an addition: readers at nisc.nova/7 are .strict() and must refuse /8.
[pass] corpus: 1,184 documents × 9 historic stamps → current, all parse
```

**An app upgrading its source.**

```
$ pnpm strata upgrade
  nisc.nova/8  HTTP endpoints: body → request, transform → response
  14 artifacts change. Expected JSON: .strata/upgrade/   Report: .strata/upgrade/REPORT.md
    src/app/actions/domains/bookings/bookings.action.ts   endpoints.load
    …
  Hand REPORT.md to your agent (or do it), then:  pnpm strata upgrade --verify

$ pnpm strata upgrade --verify
[pass] 14/14 artifacts equal their migrated JSON
```

### Shape of the package

- **core** — zero dependencies, pure: the types (`Sequence`, `Migration`,
  `Step`, `Stamp`), `upgrade()`, stamp comparison, the typed errors. The Prism
  evaluator is **injected**, the way nova's `transform` socket is (rule 6), so
  nova depends on strata's types only and stays usable anywhere.
- **`/postgres`** — the ledger and bulk row rewrites over the `PgPool` shape
  vex already defines (pg and PGlite). Modelled on midas's runner.
- **`/check`** — snapshots, the corpus runner, the `--check` gate.
- **`/cli`** — `strata migrate | check | upgrade [--verify]`.
- Each package exports its own sequence as a subpath (`@niscorp/nova/migrations`).

### Build order

| Stage | What | Unblocks |
|---|---|---|
| S0 ✅ | Package skeleton, types, the plan (pure), checksums — built 2026-09-26. `upgrade()` over document steps moves to S2 | — |
| S1 ✅ | Ledger + `sql` steps + `/postgres`; vex, moss, tide DDL moved into baseline sequences — built 2026-09-26. Adoption turned out simpler than planned: each baseline IS the old convergent `IF NOT EXISTS` DDL, so running it once over any earlier shape lands the current one and keeps the rows; no schema diffing, nothing marked applied on assumption. Baseline checksums pinned in tests | D6 |
| S2 | Embeddings; stamps on `integration_actions`, `vex_cache`; add-on intake refuses `TOO_NEW` | rows |
| S3 | Prism: `$walk`, `$renameKeys`, `$update`, `$assert`, `$has`; validation errors with paths; computed `$join` parts; the never-remove-an-op check; `irVersion` rule | migrations as data |
| S4 | `/check`: snapshots via `~standard.jsonSchema.input`, corpus from the lab apps + the three historic breaks | CI gate, npm |
| S5 | `/cli upgrade --verify` | source artifacts |
| S6 | AGENTS.md rules: no DDL in packages; every grammar change appends a migration | — |

## 6. Open

- **`$ref: '$'`** — the evaluator and two docs say `$` is the whole root; the
  schema regex refuses it, and `'$.'` works by accident. Proposed: accept `'$'`
  as canonical, desugar `'$.'` to it. Additive. *Awaiting a yes.*
- **Ledger placement** — a `strata` schema, or `strata_ledger` in the app's
  schema beside its tables?
- **midas** adopts on its own schedule (D11): its runner becomes strata's
  `midas.app` sequence, its three `zod ^4.0.0` declarations move to `^4.2.0`,
  and bumping its submodule to niscorp HEAD is strata's acceptance test.
