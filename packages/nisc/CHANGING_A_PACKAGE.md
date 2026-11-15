# Changing a package

**This file is for whoever changes a `@niscorp` package.** Whoever builds an app on them reads `AGENTS.md`, beside it. Read `/STYLE_GUIDE.md`, "The packages are live", before this: what a change may do to an app that works today comes first.

## A package follows the rules nisc sets for apps

- It runs no SQL of its own: its reads and writes are vex entries, as an app's are (`AGENTS.md`, "Using Vex").
- What crosses a boundary is parsed by a schema (`AGENTS.md` rule 13).
- Rule 16 applies in full.
- Its tables are strata sequences (rule 17).

## A package is made of modules

A module is a directory under `src/` with an `index.ts`.

1. **One door.** Code outside a module imports `../<module>`, never a file inside it.
2. **Declared dependencies.** Which module may import which is one table, in `scripts/check-modules.mts`, and the table has no cycle. A new import between two modules is a line in that table, in the same change.
3. **One owner.** Each table and each piece of state that outlives a request belongs to one module. Nobody else writes it.
4. **Narrow inputs.** A factory takes a typed object of the functions and values it needs. Never the whole manifest, never the whole runtime, never an object that stands in for either.
5. **Parse where it enters.** A body, a socket message, a row, a fetched payload, a message from another process, a token: parsed by a schema in the module where it enters. No type assertion.
6. **Nothing flat.** Only `index.ts` sits at the top of `src/`.
7. **Limits.**
   - A function of up to 200 lines is fine; 300 is the ceiling, for the rare one that reads better whole than cut up.
   - A file is at most 400 lines of code, a line at most 200 wide.
   - Do not split a function or a file to satisfy a number: split it when it has stopped being one thing.
   - The other way round too: a file of a few lines joins the file that uses it, unless it is a published entry point.
8. **The code speaks.** A comment is there only where the reasoning, a decision or the workings would be misread without it (`/STYLE_GUIDE.md`, "Comments"). No file headers, and no prose on the fields of a type: what an app author needs to know of an exported type is in the package's `DOCS.md`.

## How something new gets in

In this order, and before any of it is written:

1. Name the question it answers. It goes in the module that owns that question (a package's `DESIGN.md` says which module owns what; moss's is "How the code is laid out").
2. If it answers none of them, it is a **feature**: a directory of its own, an entry point of its own, and it reaches the core only through a seam.
   - The core never imports it, reads or writes no row of its tables, and keeps no setting of its own for it.
   - The tables that are a feature's it names on itself, and its seams reach those and no other.
3. If the seam it needs is not there, the seam is the first change, on its own, added to the module that owns the answer.
4. A new export is a decision, not a side effect of a file needing a name: it is a line in the package's `api.txt` in the same change, and it is documented under its entry point.
5. A statement outside vex is an entry in the ledger of `scripts/check-raw-sql.mts`, with its reason, or it does not exist. The reasons that count are a credential read before anybody is signed in, an engine's own store, and a migration.
6. If it fits nowhere, the architecture is wrong. Say so, and propose the refactor before writing the feature. A refactor is considered every time.

A defect found on the way gets a test that fails first. A commit moves code or changes behaviour, never both.

## The gates

All four run in `pnpm verify` and in CI.

| Run | It fails when |
|---|---|
| `pnpm check:modules` | a file other than `index.ts` sits at the top of `src/`; a module imports a file inside another module instead of its door; a module imports one the table does not give it; the table has a cycle; the core imports a feature |
| `pnpm check:api` | an entry point exports a name that is not in the package's `api.txt`, or `api.txt` names one that is no longer exported; an entry writes `export *` |
| `pnpm check:raw-sql` | a file outside the script's ledger contains a statement or a call on a database pool, or a file in the ledger contains more or fewer than its line says |
| `pnpm lint` | in moss's `src/`, or tide's Postgres store or driver (the block that lints with the compiler's types): a type assertion other than `as const`; an `any` that becomes a typed value; a written type predicate; a non-null `!`; a `function` declaration; a function over 300 lines, a file over 400 lines of code, a line over 200 wide; an inline directive that switches a rule off |

- The lint reads types, and a type from another package of the repository is read from its `dist`: `pnpm build` first, as `pnpm verify` and CI do.
- Module rules 3, 4 and 8 have no gate. They are what a review reads for.
- What two processes do to each other is in no package's tests either: those run on PGlite, which has one connection.
- `check:raw-sql` sweeps every package but vex and strata, where SQL lives.
- `check:modules` and `check:api` cover moss. A package joins `check:modules` by being made of modules and getting an entry in `PACKAGES`; it joins `check:api` by an entry in `ENTRIES` and `pnpm check:api --write`.
