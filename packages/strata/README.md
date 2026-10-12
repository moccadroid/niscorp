# @niscorp/strata

Versions for nisc. Every document an app writes — a screen, a query, a
transform — carries a **stamp**: how far along each grammar its writer was.
Read by newer code, it is upgraded through the migrations in between; read by
older code, it is refused (`TOO_NEW`), never guessed at. See
[Documents](#documents).

The tables those documents live in follow the same rules. A **sequence** is an
append-only list of migrations owned by one thing — a grammar's documents, a
package's tables, an app's tables. For tables, strata applies what is pending
**once**, records it in a **ledger**, and refuses a database whose history no
longer matches the code.

```bash
pnpm add @niscorp/strata zod
```

```ts
import { defineSequence } from '@niscorp/strata';
import { migrate } from '@niscorp/strata/postgres';

export const appSequence = defineSequence({
  id: 'acme.app',
  migrations: [
    { description: 'People', steps: [{ kind: 'sql', sql: 'CREATE TABLE people (id text PRIMARY KEY, name text NOT NULL)' }] },
    { description: 'People can be archived', steps: [{ kind: 'sql', sql: 'ALTER TABLE people ADD COLUMN archived_at timestamptz' }] },
  ],
});

await migrate(pool, [appSequence]);            // applies what is pending, records it
await migrate(pool, [appSequence], { mode: 'verify' }); // refuses if anything is pending
```

Under moss you rarely call it: the server runs every owner's sequence — moss's
own tables, the sessions table, the vex cache — in one ledgered run at boot.

## The rules

- **A migration's number is its position.** A sequence's version is its length.
  Nobody bumps a number; you append.
- **An applied migration is history.** Its steps are checksummed into the
  ledger; change them and every database that ran it refuses to boot
  (`EDITED`). Append a new migration instead. Descriptions, `dependsOn` and
  full-line `--` comments are not part of the checksum — rewording is not
  editing.
- **One statement per step.** A driver that prepares statements (PGlite, `pg`
  with parameters) refuses a string carrying several. For a DDL file, use
  `sqlSteps(ddl)` — never split on every `;`: a comment containing one is cut
  in two and its tail becomes SQL (lyceum's schema would have failed at boot).
  `sqlSteps` is not a SQL parser: a `;` that ends a line inside a string, a
  function body, a `/* */` comment or a trailing `--` comment cuts there too,
  and two statements on one line, or a `;` followed by a trailing comment, stay
  one step. Write those as their own steps.
- **A run is one transaction** under an advisory lock. A step throws, nothing
  from the run happened — Postgres DDL is transactional. Two processes booting
  at once serialize; the second finds the work done.
- **A database migrated by newer code is refused** (`TOO_NEW`), never guessed at.
- **Sequence ids are namespaced**: `nisc.vex.cache`, `nisc.moss`, `acme.app`.
  An id is lowercase, in at least two dot-separated parts (`<owner>.<name>`),
  each a letter followed by letters, digits or hyphens.
  Order across sequences is the order you pass them, bent only by `dependsOn`
  (`"nisc.moss/1"`) — deterministic, the same every time.

## API

**`@niscorp/strata`** — pure, storage-blind.

| | |
|---|---|
| `defineSequence(seq)` | Type-checks a sequence where it is written. |
| `prepare(sequences)` | Parses (Zod, at the boundary), numbers and checksums. Throws `INVALID_SEQUENCE`. Two sequences with the same id are refused the same way. |
| `planMigrations(prepared, ledger)` | Pure: what is pending, in order, and every problem (`EDITED`, `TOO_NEW`, `UNKNOWN_DEPENDENCY`, `CYCLE`). Returns `{ applied, pending, problems }`; `applied` is, per sequence given, how many of its migrations the ledger records. `UNKNOWN_DEPENDENCY` is a `dependsOn` naming a migration that no sequence given provides and the ledger does not record. |
| `refuseProblems(plan)` | Throws a plan's problems as one `StrataError`: its `code` is the first problem's, its `details` list them all. Returns when the plan has none. `migrate` refuses a plan this way. |
| `checksumOf(migration)` | SHA-256 over the steps (WebCrypto — Node ≥ 22 and every browser). |
| `sqlSteps(ddl)` | A DDL file as one step per statement, for a file where every statement ends its line with `;`. Cuts at each line that ends in `;`, full-line `--` comments excepted. Not a SQL parser. |
| `SequenceSchema`, `MigrationSchema`, `StepSchema` | The grammar, as Zod. |
| `StrataError` | `code` + a sentence + `details`. |

**`@niscorp/strata/postgres`**

| | |
|---|---|
| `migrate(pool, sequences, { mode, guard, dryRun, table, schema })` | The run. `mode: 'apply'` (default) or `'verify'`. Returns `{ applied, plan }`. `guard(tx)` is asked inside the run, after the last pending step — when nothing was pending too: every sentence it returns refuses the run (`DOES_NOT_FIT`), and nothing was applied. `dryRun` does all of it, guard included, then rolls it back — the report says what would be applied, and it takes the locks a real run takes. `applied` is what this run applied, in order; `plan` is the plan it acted on, so `plan.applied` holds each sequence's position before the run. `'verify'` refuses with `PENDING` when anything is pending, and a step that throws refuses the run with `STEP_FAILED`. |
| `status(pool, sequences, options)` | The plan, read-only — creates nothing, not even the ledger. |
| `readLedger(pool, options)` | The ledger's rows; empty for a database never migrated. |
| `ledgerDdl(options)` | The ledger table's DDL — the one statement strata runs outside a ledger. |

The pool is structural — `{ query, transaction }`, the shape vex's PGlite pool
and a wrapped `pg` pool already have. A pool without `transaction` is refused
(`NO_TRANSACTION`): a run must land whole or not at all. `query` and
`transaction` are called on the object that has them, so a driver's own object
whose methods reach for `this` — a PGlite, a `pg` client handed through as the
transaction — works as it is.

The ledger defaults to `strata_ledger` in the connection's schema, beside the
app's tables; `table` and `schema` move it.

## Adopting a database from before strata

Packages used to converge their tables on every boot with
`CREATE … IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`. Each package's migration
1 is that DDL, verbatim — so it **is** the adoption: run once over any earlier
shape of the tables it lands the current one, keeps the rows, and is recorded
so it never runs again. From then on changes are plain appended migrations.

## Documents

A **grammar** sequence owns document kinds instead of tables. It declares its
kinds and where other documents nest inside them (its **embeddings**), and its
migrations are **document steps** — a transform over one document of one kind.
A kind's name in `documents` is lowercase — a letter, then letters, digits or
hyphens — and everywhere else the kind is written `<sequence id>/<name>`
(`nisc.nova/layout`).

```ts
export const NOVA_SEQUENCE = {
  id: 'nisc.nova',
  documents: {
    action: { embeds: { layout: 'nisc.nova/layout', 'endpoints.*.request': 'nisc.prism/config' } },
    layout: { embeds: { children: 'nisc.nova/layout', 'children[]': 'nisc.nova/layout', then: 'nisc.nova/layout' } },
  },
  migrations: [],
};

// An app's kit: Button's `label` prop is now `text` — one flat node at a time.
// `documents` is what says this sequence is a grammar; the kit has no kinds of
// its own (it rewrites nova's layouts), so it declares none.
export const kit = {
  id: 'acme.kit',
  documents: {},
  migrations: [{ description: 'Button: label → text', steps: [{ kind: 'document', at: 'nisc.nova/layout', transform: renameLabelPrismConfig }] }],
};

const upgrader = await createUpgrader([NOVA_SEQUENCE, PRISM_SEQUENCE, kit], { transform: prismEvaluate });
const { document, stamp, applied } = upgrader.upgrade(storedAction, { kind: 'nisc.nova/action', stamp: row.grammar });
```

- **A document carries a stamp** — `{ "nisc.nova": 3, "acme.kit": 1 }`, how far
  along each grammar its writer was — and is upgraded where it is read. Grammars
  are never recorded in a ledger: documents travel (an add-on built on older
  code submits older documents), so their version travels with them. One
  sequence owns tables or documents, never both. `migrate` refuses a grammar
  sequence (`WRONG_OWNER`).
- **A grammar declares `documents`**, from its first release — `{}` if it has
  no kinds of its own. That is how strata tells the two owners apart: a sequence
  is a grammar when it declares `documents` or has a document step, and anything
  else owns tables. A kit with no migrations yet, or with only empty markers,
  and no `documents` therefore reads as owning tables, and `createUpgrader`
  refuses it (`WRONG_OWNER`). Declare `documents`; do not hand it to `migrate`.
- **The walker does the recursion.** Embedding paths use `key`, `*` (every
  value of a record) and `[]` (every item of an array) — kept apart because
  nova's `children` is a lone node or an array. Every document of a step's kind
  is found at any depth and rewritten on its own, deepest first; a transform
  only ever sees one node.
- **The transform is injected** — `(config, source) => unknown`, nova's socket.
  Under moss it is Prism's `evaluate`; a migration runs exactly like an endpoint.
  The source is `{ document, path }`.
- **No stamp** (`{}`, `null`) reads as the start of every grammar. **Ahead of
  the code** on any grammar the code was given is refused, `TOO_NEW`: the reader
  upgrades first. A stamp entry for a grammar the code was not given is neither
  ahead nor behind: it is kept on the stamp as it was, for code that has it.

| | |
|---|---|
| `createUpgrader(grammars, { transform })` | `{ stamp, upgrade, locate, behind }` — the stamp a document written now carries; upgrade one; every document inside one, by kind; is a stamp behind (throws if ahead). A kind no sequence given declares is refused (`UNKNOWN_KIND`): a step's `at` or an embedding's target when the upgrader is created, the `kind` passed to `upgrade` or `locate` when it is called. |
| `upgrader.upgrade(document, { kind, stamp })` | Returns `{ document, stamp, applied }`: `stamp` is what to store with the document, `applied` the refs of the migrations that ran, in order — empty when the document was already current. |
| `upgrader.locate(document, kind)` | Given the root's kind, `{ path, kind, value }` for the root itself and every document embedded in it; `path` is the keys and indexes from the root. |
| `upgradeStore(pool, store, upgrader)` | `@niscorp/strata/postgres`. Rewrites every row of a table holding documents that is behind, in one transaction; a row from newer code refuses the pass. `store` is `{ table, schema?, column, stamp, kind, key }`: `column` and `stamp` name the jsonb columns holding the document and its stamp, `kind` is the kind of every document in the store (`"nisc.nova/action"`), `key` lists the columns that identify a row. Returns `{ total, upgraded, applied }`: rows read, rows that were behind and rewritten, and per migration ref the number of rows it was applied to. |

## The check

**`@niscorp/strata/check`** — the gate a grammar change has to pass. Pure; the
host keeps the files.

| | |
|---|---|
| `snapshotOf(sequence, schemas)` | Each kind's JSON Schema, through the schema's own Standard JSON Schema hook (Zod ≥ 4.2, Valibot, ArkType), as the validator wrote it — keys sorted, nothing removed. `schemas` must cover exactly the grammar's kinds. |
| `compareSnapshot(recorded, current)` | `same`, `missing`, or `changed` with short diff lines (`+ properties.retry`, `- required["id"]`, `+ required["key"]`). Changed at the same version = a migration is owed. Both sides are compared without prose (the `description` keyword — a field named `description` is grammar) and in one spelling (definitions inlined unless recursive, `allOf: [{ $ref }]` as `$ref`, a union of bare types as a type list), so a reworded `.describe()` or a validator's respelling is not a change. `recorded` is the snapshot kept for the grammar's current version, `undefined` when none was kept (`missing`). |
| `snapshotText(snapshot)` | Stable file text: sorted keys. |
| `checkCorpus(upgrader, schemas, documents)` | Every captured document, upgraded from its stamp, must pass its kind's current schema. |
| `diffJson(a, b, limit)` | What differs between two JSON values, as short lines: `+ a.b` (added), `- c` (removed), `~ d: 1 → 2` (changed). At most `limit` lines, 20 by default. |

A snapshot only says *something moved*; the corpus of real documents is the
judge of whether old ones survive. nisc runs both on its own grammars in CI
(`pnpm check:grammars`; records in the repo's `strata/` directory).

## Source — `strata upgrade`

Artifacts written in an app's TypeScript are not rewritten by machine — a
codemod would have to understand every way a person writes an object. strata
works out EXACTLY what each must become, and holds the edit to it.

```ts
// the app's src/dev/strata.ts — it lists its artifacts; strata does the rest
import { runSourceUpgrade } from '@niscorp/strata/node';
process.exit(await runSourceUpgrade({ root, grammars, transform: evaluate, schemas, documents }, process.argv.slice(2)));
```

```bash
pnpm strata status --check   # the source against the installed grammars (CI)
pnpm strata upgrade          # .strata/upgrade/: expected JSON + REPORT.md (file, "look in", migrations, diff)
pnpm strata verify           # the edited source must equal it; then strata.lock.json moves
```

`strata.lock.json` (committed) is the source's stamp. `upgrade` plans from it:
artifacts a migration changes get their expected JSON and a positional diff;
the rest are recorded as untouched. `verify` passes only when every planned
artifact equals its expected JSON (key order aside), every untouched one is
still one no migration would change, and nothing was added or removed since
the plan — then the lock moves and the work files go. A migration whose result
fails the current schema stops the plan: no edit could pass. `init` records a
lock for a source that has never had one.

| | |
|---|---|
| `@niscorp/strata/upgrade` | Pure: `planSourceUpgrade`, `verifySourceUpgrade`, `renderReport`, `changedStrings`. `planSourceUpgrade`'s `describe(ref)` returns the description of the migration `ref` names, for the report; it is asked for every migration between the source's stamp and the upgrader's. |
| `@niscorp/strata/node` | `runSourceUpgrade(options, argv)` — the lock, the work directory, the report, "look in" hints from the source. `sources` is the directory under `root` that is searched for the files an artifact is written in (default `src`). |

See [DESIGN.md](./DESIGN.md) and [the plan](../../docs/plans/versioning.md).

## License

Apache-2.0
