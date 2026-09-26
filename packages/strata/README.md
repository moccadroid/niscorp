# @niscorp/strata

Migrations for nisc. A **sequence** is an append-only list of migrations owned
by one thing — a package's tables, an app's tables, and (next) a grammar's
documents. strata applies what is pending **once**, records it in a **ledger**,
and refuses a database whose history no longer matches the code.

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
  with parameters) refuses a string carrying several.
- **A run is one transaction** under an advisory lock. A step throws, nothing
  from the run happened — Postgres DDL is transactional. Two processes booting
  at once serialize; the second finds the work done.
- **A database migrated by newer code is refused** (`TOO_NEW`), never guessed at.
- **Sequence ids are namespaced**: `nisc.vex.cache`, `nisc.moss`, `acme.app`.
  Order across sequences is the order you pass them, bent only by `dependsOn`
  (`"nisc.moss/1"`) — deterministic, the same every time.

## API

**`@niscorp/strata`** — pure, storage-blind.

| | |
|---|---|
| `defineSequence(seq)` | Type-checks a sequence where it is written. |
| `prepare(sequences)` | Parses (Zod, at the boundary), numbers and checksums. Throws `INVALID_SEQUENCE`. |
| `planMigrations(prepared, ledger)` | Pure: what is pending, in order, and every problem (`EDITED`, `TOO_NEW`, `UNKNOWN_DEPENDENCY`, `CYCLE`). |
| `checksumOf(migration)` | SHA-256 over the steps (WebCrypto — Node ≥ 22 and every browser). |
| `SequenceSchema`, `MigrationSchema`, `StepSchema` | The grammar, as Zod. |
| `StrataError` | `code` + a sentence + `details`. |

**`@niscorp/strata/postgres`**

| | |
|---|---|
| `migrate(pool, sequences, { mode, table, schema })` | The run. `mode: 'apply'` (default) or `'verify'`. Returns `{ applied, plan }`. |
| `status(pool, sequences, options)` | The plan, read-only — creates nothing, not even the ledger. |
| `readLedger(pool, options)` | The ledger's rows; empty for a database never migrated. |
| `ledgerDdl(options)` | The ledger table's DDL — the one statement strata runs outside a ledger. |

The pool is structural — `{ query, transaction }`, the shape vex's PGlite pool
and a wrapped `pg` pool already have. A pool without `transaction` is refused
(`NO_TRANSACTION`): a run must land whole or not at all.

The ledger defaults to `strata_ledger` in the connection's schema, beside the
app's tables; `table` and `schema` move it.

## Adopting a database from before strata

Packages used to converge their tables on every boot with
`CREATE … IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`. Each package's migration
1 is that DDL, verbatim — so it **is** the adoption: run once over any earlier
shape of the tables it lands the current one, keeps the rows, and is recorded
so it never runs again. From then on changes are plain appended migrations.

## Not yet

Document steps — migrating the JSON stored in rows and written in source files,
with migrations authored as Prism configs — and the check that gates a grammar
change on a migration. See [DESIGN.md](./DESIGN.md) and
[the plan](../../docs/plans/versioning.md).

## License

Apache-2.0
