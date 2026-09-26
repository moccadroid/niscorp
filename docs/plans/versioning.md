# Versioning, migrations and strata

> **Status (2026-09-26): built — package side and strata S0–S6.** Apache-2.0,
> consumable manifests, the zod peer + cross-copy check, nisc packages as
> peers, changesets + `@niscorp/nisc` + the breaking-dependents gate, the moss
> wire protocol version, golden credential hashes, Prism stored-IR speed + the
> `$const` fix; and **strata**: the ledger for every table nisc owns (S1);
> documents stamped and upgraded through grammar sequences with embeddings (S2);
> Prism's transform ops, errors that say where, and the op set that only grows
> (S3 — its own grammar change was the gate's first real catch: `nisc.prism/1`);
> the grammar gate with a 131-document corpus (S4); `strata upgrade` for app
> source with a committed lock, rehearsed on relay with a real rename and
> enforced by `pnpm check:sources` (S5); rules 17–20 in AGENTS.md (S6).
> **Open:** npm publishing (a future step, not scheduled); midas adopts on its
> own (corpus, lock). lyceum adopted: its tables are `lyceum.app`, its source
> has a lock, its 26 documents are in the corpus (157).

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
| `0e23d05` strata S0+S1 | the package; the ledger; vex's cache and moss's tables as sequences, baselines = the old DDL (adoption); pinned checksums; moss `migrations: 'apply' \| 'verify'` |
| `51323ed` showroom | the strata module: *The ledger*, *Adopt an old database* |
| `4a5f716` strata S2 | grammar sequences, embeddings, stamps, `createUpgrader`, `upgradeStore`; nova/prism `/migrations`; moss stamps `integration_actions`, upgrades at boot/intake/read; `NiscApp.grammars` |
| `28aa41d` strata S4 | `/check`; `pnpm check:grammars`; snapshots + the 131-document corpus; `prismTransform` moved into Prism |
| `2371824` strata S3 | Prism transform ops, `$ref: "$"`, computed `$join`, errors with paths, the never-fold fix, `EVERY_OP_EVER`; `nisc.prism/1` |
| `e17e419` strata S5+S6 | `/upgrade`, `/node`, `strata.lock.json` in four lab apps, `pnpm check:sources`; AGENTS.md rules 17–20 |
| `27ba5f1` relay | `*.read` roles deny the engine's tables (integration key hashes); the charter check resolves against the booted universe (AGENTS.md rule 10a) |

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

### What it looks like

(Sketched before S0; updated to what was built. The API reference is
[strata's README](../../packages/strata/README.md).)

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
// packages/nova/src/migrations/index.ts — exported as @niscorp/nova/migrations
// (the Zod schema behind each kind is separate data: NOVA_SCHEMAS, read by the gate)
export const NOVA_SEQUENCE: Sequence = {
  id: 'nisc.nova',
  documents: {
    action: {
      embeds: {
        layout: 'nisc.nova/layout',
        'endpoints.*.request': 'nisc.prism/config',
        'endpoints.*.response': 'nisc.prism/config',
      },
    },
    layout: {
      // `*` crosses a record's values, `[]` an array's items — `children` is a lone node or an array
      embeds: { children: 'nisc.nova/layout', 'children[]': 'nisc.nova/layout', then: 'nisc.nova/layout', else: 'nisc.nova/layout', do: 'nisc.nova/layout' },
    },
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

Read path: `createUpgrader(grammars, { transform: prismTransform }).upgrade(row.definition, { kind: 'nisc.nova/action', stamp: row.grammar })`
→ the current document and stamp, or `StrataError` (`TOO_NEW`,
`UNKNOWN_KIND`, `STEP_FAILED`). moss runs `upgradeStore` over
`integration_actions` at boot, upgrades on intake and on read. (Squashing old
migrations is not built — nothing is old enough yet.)

**The ledger.**

```
strata_ledger
 sequence            | n | description                                                              | checksum
 nisc.moss           | 1 | Integrations, their actions and the generation pointer, converged …     | 1c21031d…
 nisc.moss           | 2 | Stored integration actions carry the grammar stamp their definition is … | 92bd612e…
 nisc.moss.sessions  | 1 | The sessions table: a token is stored only as its hash                   | 83a62e02…
 nisc.vex.cache      | 1 | The vex cache table, converged from any earlier shape                    | c2c5ca08…
```

moss applies it at boot (`migrations: 'apply'`, the default) or refuses to boot
with anything pending (`'verify'`). An edited, already-applied migration or a
ledger written by newer code refuses either way.

**CI when somebody changes a grammar.**

```
$ pnpm check:grammars          # the real first catch — Prism's own S3 change
[pass] nisc.nova matches strata/snapshots/nisc.nova/0.json
[fail] nisc.prism changed since nisc.prism/0 (strata/snapshots/nisc.prism/0.json) — and no migration says so
       nisc.prism/config:
         ~ $defs.__schema2.anyOf[$ref].properties.$ref.pattern: "^\\$\\." → "^\\$(\\..*)?$"
         + $defs.__schema2.anyOf[$has]
         + $defs.__schema2.anyOf[$walk]
         …
       Append a migration to nisc.prism — an empty marker is enough for an addition …
[pass] corpus: 131/131 captured documents upgrade and parse
```

**An app upgrading its source.**

```
$ pnpm strata upgrade          # the relay rehearsal: a kit renaming the table's `empty` prop
[plan] nisc.nova 0, nisc.prism 1 → nisc.nova 0, nisc.prism 1, relay.kit 1: 1 migration(s)
       relay.kit/1  Table: empty → emptyText
       4 artifact(s) to edit, 21 untouched.
       src/app/actions/domains/company/companies.action.ts  crm.companies
       …
       Report: .strata/upgrade/REPORT.md — edit, then: strata verify

$ pnpm strata verify
[pass] nisc.nova/action:crm.companies matches its migrated JSON
…
[pass] 21 artifact(s) no migration touches, still untouched
[pass] the source is now written at nisc.nova 0, nisc.prism 1, relay.kit 1 — strata.lock.json updated.
```

### Shape of the package

- **core** — pure, zod its only peer: the grammar (`Sequence`, `Migration`,
  `Step`), `prepare` / `planMigrations`, `createUpgrader` (stamps, `upgrade`,
  `locate`, `behind`), the typed errors. The Prism evaluator is **injected**,
  the way nova's `transform` socket is (rule 6), so nova depends on strata's
  types only (an optional peer, for its `/migrations` subpath).
- **`/postgres`** — `migrate`, `status`, `readLedger`, `upgradeStore`, over the
  `{ query, transaction }` pool shape (pg and PGlite). Modelled on midas's runner.
- **`/check`** — `snapshotOf`, `compareSnapshot`, `checkCorpus`, `diffJson`.
- **`/upgrade`** — `planSourceUpgrade`, `verifySourceUpgrade`, `renderReport` (pure).
- **`/node`** — `runSourceUpgrade`: the lock, the work directory, the commands
  an app's `src/dev/strata.ts` exposes (`status`, `init`, `upgrade`, `verify`).
- Each grammar owner exports its sequence and schemas as a subpath
  (`@niscorp/nova/migrations`, `@niscorp/prism/migrations`).

### Build order

| Stage | What | Unblocks |
|---|---|---|
| S0 ✅ | Package skeleton, types, the plan (pure), checksums — built 2026-09-26. `upgrade()` over document steps moves to S2 | — |
| S1 ✅ | Ledger + `sql` steps + `/postgres`; vex, moss, tide DDL moved into baseline sequences — built 2026-09-26. Adoption turned out simpler than planned: each baseline IS the old convergent `IF NOT EXISTS` DDL, so running it once over any earlier shape lands the current one and keeps the rows; no schema diffing, nothing marked applied on assumption. Baseline checksums pinned in tests | D6 |
| S2 ✅ | Document steps, embeddings, `createUpgrader`, `upgradeStore`; nova + Prism grammar sequences; `integration_actions` stamped, upgraded at boot, intake and read; add-on intake refuses `TOO_NEW` — built 2026-09-26. Two departures from the sketch: `vex_cache` is NOT stamped (its rows are re-seeded or regenerable — a cache, not a store), and S3's `$walk` turned out unnecessary for anything a grammar's embeddings describe: the walker recurses, a migration is one flat node | rows |
| S3 ✅ | Prism: `$walk`, `$renameKeys`, `$update`, `$assert`, `$has`; `$ref: "$"`; computed `$join` parts; validation errors that name the branch meant, with paths; `EVERY_OP_EVER` — built 2026-09-26. Found on the way: the optimizer constant-folded `$ref`/`$var` (`$ref: "$"` compiled to `{}`). `irVersion` stays 1: the IR's container is unchanged, and the op set is versioned by `nisc.prism` | migrations as data |
| S4 ✅ | `/check`: snapshots via `~standard.jsonSchema.input`, corpus from the lab apps — built 2026-09-26. 131 documents (atrium, encore, lyra, relay; lyceum skipped while mid-edit). Verified red on an unmigrated addition (snapshot) and a breaking rename (snapshot + 122 corpus failures). The three historic breaks are NOT in the corpus: they predate version 0, the grammar as it stood when strata arrived. midas's corpus is its own to capture | CI gate, npm |
| S5 ✅ | `@niscorp/strata/upgrade` + `/node`: `strata.lock.json`, `upgrade` (expected JSON + REPORT.md with file, "look in", positional diff), `verify` (exact, then the lock moves); atrium, encore, lyra, relay carry locks and moved to `nisc.prism/1` through the loop; a real rename rehearsed on relay (careless edit refused, complete edit verified, reverted); `pnpm check:sources` in CI — built 2026-09-26 | source artifacts |
| S6 ✅ | AGENTS.md rules 17–20 and review item 9 — built 2026-09-26 | — |

## 6. Open

- **npm publishing** — a deliberate future step. Before it: drop the pending
  changesets so every package's first release is 0.1.0 with all of this in it.
- **midas** adopts on its own schedule (D11): its runner becomes strata's
  `midas.app` sequence, its three `zod ^4.0.0` declarations move to `^4.2.0`,
  it keeps a `strata.lock.json` and captures its own corpus, and bumping its
  submodule to niscorp HEAD is strata's acceptance test.
- Decided along the way (recorded, the user's call): `$ref: '$'` accepted
  (S3); the ledger is `strata_ledger` in the app's schema (configurable);
  `vex_cache` is not stamped (a cache, not a store).
