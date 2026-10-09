# @niscorp/vex

## 0.3.0

### Minor Changes

- f834f3f: `evaluate` checks a config object once and only evaluates it after that; `prismTransform` is gone. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-09: replace `prismTransform` with `evaluate` (`transform: evaluate`), and pass limits as `{ limits: … }`.

  Prism had three ways to run a config, and the one a host was told to hand to its seam (`prismTransform`) was the one that reported worst, while the hosts on a hot path each wrapped `evaluate`, which checked the config on every call. There are two now, with one job each.

  **`evaluate(config, source, options?)`** — for a config a program holds.
  - The first time it is handed a config object it checks it and keeps its tree; the second time it prepares the tree as `compile` would; from then on a call only evaluates. Four fields picked and renamed, the same config object again: 3.5 µs before, 0.4 µs now. A nested choice on two fields: 18 µs before, 0.7 µs now. A config that is a new object on every call costs what it did.
  - It is kept **by the object**: a config changed in place after its first call is not read again. Hand over a new object.
  - Both arguments are `unknown`, so it is what a host's transform seam takes: `createTide({ transform: evaluate })`, `createUpgrader(grammars, { transform: evaluate })`.
  - The third argument is `{ limits?, check? }`. Limits were the third argument themselves: `evaluate(config, source, { maxSteps: 100 })` is now `evaluate(config, source, { limits: { maxSteps: 100 } })`.
  - `check: 'always'` is for writing a config, for tests and for tools: nothing is kept, the config is checked on every call, and the source must be plain JSON (a source holding `undefined`, a function, a `Date` or a non-finite number is refused with `E_TYPE`).
  - An invalid config is a `PrismError` (`E_SCHEMA`) naming the part that is wrong, however deep the config. `prismTransform` threw zod's own error, and a `RangeError` for a config nested far past the limit.

  `evaluateSafe` takes the same arguments.

  **`compile` and `execute`** — for a config that is stored. Unchanged.

  **`prismTransform` is removed**, from `@niscorp/prism` and from `@niscorp/prism/migrations`. What it added over `evaluate` was a check that the source is plain JSON; that check is now `check: 'always'`, and a seam's source is taken as it is.

  **moss, nova, vex, loom, nisc, create-nisc and the cli move with it.** Each has Prism as a peer or a dependency, or has one of those that do, and a Prism at 0.3 is outside the range their last versions accept: an app takes them together. Nothing in vex, loom or the cli changed beyond that range.

  moss's shell and nova's `$prism` binding called `evaluate` on every use and so paid the check each time: an endpoint's request and response under moss, and a `$prism` value on each draw and for each row of a list, are 8 to 45 times faster for the configs measured. tide's and strata's documentation name `evaluate` where they named `prismTransform`.

  **What to change**
  - `import { prismTransform } from '@niscorp/prism'` or `'@niscorp/prism/migrations'` → `import { evaluate } from '@niscorp/prism'`, and `transform: prismTransform` → `transform: evaluate`. Every app made by `create-nisc` has this in `src/dev/strata.ts`; the app's typecheck and `npm run strata` both stop on that line until it is changed.
  - A third argument of limits becomes `{ limits: … }`.
  - A wrapper that parsed the config before calling `evaluate` (`evaluate(ConfigSchema.parse(config), …)`) makes a new object on every call and so is checked on every call: hand `evaluate` the config itself.
  - Code that changes a config object in place and evaluates it again must hand over a new object, or pass `{ check: 'always' }`.
  - A host that relied on `prismTransform` refusing a source that is not plain JSON checks it itself, or passes `{ check: 'always' }`.

### Patch Changes

- Updated dependencies [023bcf9]
- Updated dependencies [1db6df4]
- Updated dependencies [6d098e4]
- Updated dependencies [8b4d97e]
- Updated dependencies [f834f3f]
- Updated dependencies [b084e30]
- Updated dependencies [663d724]
- Updated dependencies [6512d91]
- Updated dependencies [7d682b9]
- Updated dependencies [d2e9d22]
- Updated dependencies [e0e8abc]
- Updated dependencies [7fe1135]
  - @niscorp/prism@0.3.0

## 0.2.3

### Patch Changes

- 1e5ad2d: An insert requires every key its `values` bind, whatever `onConflict.set` puts in the same column.

  An `insert` or `insertEach` may set the same column in `values` and in `onConflict.set`. Vex read the two by column name, so where they put different things in a column it saw only what `onConflict.set` put there. A `$context` key that `values` used for that column, and that nothing else in the statement used, was not in the entry's derived signature and was not required. A call that left it out was not refused. The statement ran with that parameter unbound, and a new row was written with NULL in the column — or, where the column is NOT NULL, the database's own error came back in place of vex's. DOCS.md says a write never executes with holes; now this one does not.

  ```ts
  { op: 'insert', table: 'people',
    values: { email: { $context: 'email' }, name: { $context: 'name' } },
    onConflict: { target: ['email'], set: { name: { $context: 'newName' } } } }
  ```

  - A call without `name` is refused before any SQL runs: 400 `missing_context`, `Mutation is missing context: name.` (was 200, and a row with `name` NULL).
  - Discovery, `collectMutationContext` and the refusal's `details.expected` list both `name` and `newName` (listed `newName` only). `requiredContextKeys` returns both.
  - The same where `onConflict.set` puts a literal or a `$lookup` in the column rather than another key, and for the keys a `$lookup` in `values` binds.

  An entry that puts different things in one column in the two places has its signature read `values` first, then `onConflict.set`. Its keys can come in another order than before, and a key used in both is listed with the column and type of its place in `values`.

  Nothing else moves. An entry whose `values` and `onConflict.set` share no column, or put the same thing in every column they share (the create-or-fetch touch, `set: { email: { $context: 'email' } }`), lists and requires what it did, in the same order. `update`, `delete` and `mutationEffect` are unchanged.

  **What to change:** nothing, unless an entry sets a column in `values` from a `$context` key, sets the same column in `onConflict.set` from anything else, and some caller leaves that key out. That call wrote a NULL and is now answered 400. Send the key — `null` to write NULL on purpose; only an absent key is refused — or, if the column was never meant to be set on insert, take it out of `values`.

- 2011951: A mutation batch can use what an earlier statement wrote: `{ $returned: 'table.column' }`.

  A batch ran in one transaction but no statement could see another's result. A row whose id the database generates could not be referenced by the rows written after it in the same batch.

  A later statement of a batch can now read a column of the one row an earlier statement wrote:

  ```ts
  [
    { op: 'insert', table: 'orders', values: { note: { $context: 'note' } } },
    {
      op: 'insertEach',
      table: 'order_lines',
      items: { $context: 'lines' },
      values: { order_id: { $returned: 'orders.id' }, sku: { $item: 'sku' } },
    },
  ];
  ```

  The reference names the earlier statement — an insert, update, upsert or delete — by the table it writes. It goes in any value position (`values`, `set`, `onConflict.set`, an `upsert`'s `columns` and `insert`), and not in a `where`, a `$lookup`, or an `insertEach`'s `items`. It is for keys: the value passes through the driver, and a timestamp read back that way keeps milliseconds only.

  The statement it names must write exactly one row. When it wrote none (its WHERE matched nothing, or the scope boundary kept the row back) or several, the batch fails with `execution_error` and nothing is written. `lintMutation` — so `seedCache` — refuses a reference that no earlier statement can answer, that two earlier statements could answer, that names an `insertEach`, or that names an `insert` whose `onConflict` has no `set`. Scope is unchanged: each statement is scoped on its own, as before.

  Every existing entry, request and reply behaves as it did. `MutationValue` gains one union member, `ReturnedRef`.

  **What to change:** nothing. To use it, upgrade every process that reads the cache first: a vex older than this one deletes a stored entry whose grammar it does not know, as it does for any form added since it was built.

- 2c57a38: Under `require`, an engine error on a read keeps its HTTP status.

  The CommonJS build gives each entry point its own copy of `VexError`, and the HTTP handler recognised an engine's error by `instanceof`. With the engine from `require('@niscorp/vex')` and the endpoint from `require('@niscorp/vex/hono')` or `require('@niscorp/vex/express')`, every error the engine threw on a read was therefore answered as an unexpected one: 500, without its `details`, and with a `[vex] unhandled error` line in the log. The ESM build has one copy of the class and answered as DOCS.md says. Now both do:
  - an unknown fingerprint is 404 `cache_miss` (was 500);
  - a protected entry asked to change is 409 `fingerprint_protected` (was 500);
  - `locked`, `agent_failed`, `unsatisfiable`, `scope_denied`, `invalid_dsl` and an `execution_error` thrown by the engine are 400, with `details` where the error has them (were 500, without);
  - `missing_scope` is still 500, and its reply no longer names the scope keys the host left out — they go to the log, as they always did under ESM.

  The same was true of an app that loads vex in both formats at once, and of moss loaded with `require` (its `/api/…/vex` endpoints). Writes were never affected: the handler runs them itself.

  The engine has the same check for a generation hook's `unsatisfiable`. With the hook from `require('@niscorp/vex/agent')` it never matched, so nothing was negative-cached and the model was asked again on every repeat of a request it had already called impossible. The refusal is cached now, for `unsatisfiableTtlMs` (five minutes unless set), as it is under ESM.

  Vex now recognises its own errors by a mark every copy of the class carries. Nothing is added to the exports, and nothing an error prints or serializes changes. An app's own `err instanceof VexError` is as it was: it holds for an error the engine throws, and under `require` it still does not hold for one made in `@niscorp/vex/agent` — read `err.code` there (DOCS.md, "Error handling").

  **What to change:** nothing in an ESM app, and nothing in a CommonJS app that calls `handleQuery` from `@niscorp/vex` itself. A CommonJS app that had come to depend on those 500s now sees the documented status: a client that reads 500 as "unknown fingerprint", a retry or an alert on 5xx, a log search for `[vex] unhandled error`.

- 2d20daf: The Hono adapter answers a body that is not JSON with 400 `invalid_request`, not 500.

  `POST`, `PATCH` and `DELETE` parsed the body unguarded, so a parse failure threw out of the route: text, a multipart or urlencoded form, truncated JSON, or no body at all was answered `500 Internal Server Error` in plain text, with the `SyntaxError` on the server's log — a server fault for what is the request's mistake, and the one failure on this surface without the `{ error, message }` shape. It is now `400 { "error": "invalid_request", "message": "Body must be JSON" }`, on a locked endpoint as well. A moss app's vex surfaces (`/api/vex`, `/api/<resource>/vex`) are this adapter, so they answer the same.

  Nothing else moves. Every request that was answered before is answered the same, byte for byte: JSON of the wrong shape keeps its own 400; JSON sent as `text/plain` or with no content type is still read (the content type is never looked at); `getScope` still runs before the body is read; `onExecute` hears nothing for a body that was never a request, as before. The body is still read through hono's own `c.req.json()`, so a middleware that read it first shares hono's cache with the adapter exactly as before, on every hono 4. Only the parse failing is caught — a body that cannot be read at all, or a stream that broke, still throws. The Express adapter was not affected: it is handed `req.body` and already answered 400.

  **What to change:** nothing, unless something of yours was built on the 500. A host's own `onError` (or a middleware reading `c.error`) no longer sees a `SyntaxError` for these requests — the response is the 400 above, not the one the handler made. A client that retried on 5xx stops retrying them. A nova endpoint aimed at a vex url with no `request` declared now fails with `@error.status` 400 and the message `Body must be JSON`, where it had 500 and `HTTP 500`.

- b711c38: The reply says when the engine's own limit may have cut a list.

  A list query that states no `limit` is given `defaultLimit` (100), and a generated one asking for more than `maxLimit` is clamped. Either way the reply carried the rows and nothing else: a list of 100 looked like a list that had 100 things in it.

  When the `LIMIT` a query ran with was the engine's number — the default, or the maximum — and exactly that many rows came back for a list, `meta.warnings` now carries one line saying the list may have been cut and which number did it. For a request that named a fingerprint the same line is written once per fingerprint with `console.warn`, because a host that hands callers `result` without `meta` would show it to no one.

  It says "may": no extra row is fetched to find out, so a list of exactly that many rows gets the line too. A list that ended on a `limit` its author stated gets none, and neither does a single-row answer. No `result` changes, and no query reads a different number of rows.

  **What to change:** nothing. If the line appears for one of your entries, state the `limit` that list should have.

- 3d8518c: `mutationMisfits(def, schema)`: why a stored write does not fit a schema, without running it.

  Every write passes two column gates before it runs: its table, the columns it writes, its WHERE, its `$lookup`s and its conflict target must be the schema's, and so must a column it reads from an earlier statement (`$returned`). Those gates could only be met by running the write.

  `mutationMisfits` asks them and runs nothing: one sentence for each refusal, none when the write fits. An upsert is asked as both statements it can become. Scope is not applied — what a policy stamps or bounds is checked where the principal is known.

  **What to change:** nothing.

- b711c38: A seeded entry runs with the `limit` its author wrote, past `maxLimit`.

  `maxLimit` (1000 by default) clamped every query, including one a developer wrote and seeded: a seeded entry that stated a larger `limit` ran with `maxLimit` in its place, and the reply did not say so.

  `maxLimit` now clamps only a query nobody reviewed — one generated for a request. An entry seeded with `seedCache` runs with the `limit` it states. Which kind an entry is comes from the stored row and not from the request: protected, with no request hash. That is what `seedCache` writes, and what a host writes when it stores an entry through the cache backend itself; no request can produce it. A generated entry stays clamped when it is replayed, when it is stored under a name the caller chose, and when it is protected afterwards. `engine.compile` takes a bare query and clamps as before; `engine.test` still runs with a limit of 5.

  One edge: a generated entry that was protected and is then seeded with the identical definition keeps its request hash, because `seedCache` leaves a row that already matches alone. It stays clamped, and its reply says so, until it is unprotected or deleted and seeded again.

  **This changes what an existing app receives in one setup:** a read entry the host stored itself — seeded, or written protected through the cache backend — whose `limit` is above the engine's `maxLimit` returned `maxLimit` rows and now returns up to its stated `limit`. Nothing changes for an entry that states no limit, one that states `maxLimit` or less, a generated query, or a mutation.

  **What to change:** nothing, if the larger answer is what the entry was written for. To keep the clamp on seeded entries, set `config.capAuthored: true` on the engine (under moss: `runtime.vexConfig: { capAuthored: true }`).

- 1903342: An upsert's signature lists the key its `columns` bind, also for a column its `insert` sets too.

  An `upsert` may set the same column in `columns` and in `insert`: the first is written when it updates, the second when it creates. Its derived signature read the two merged by column name, so where they used different `$context` keys only the one in `insert` was listed. The key the update binds was missing from discovery and from `collectMutationContext` — and from `details.expected` of the very `missing_context` refusal that named it. What an upsert requires was right all along, on both branches; only the listing was short.

  ```ts
  { op: 'upsert', table: 'people', key: 'id',
    columns: { name: { $context: 'name' } },
    insert: { name: { $context: 'firstName' } } }
  ```

  - The signature lists `name` beside `firstName` (listed `firstName` only). `firstName` is still marked `insert only`.
  - Where both halves use the same key for the column, that key is no longer marked `insert only`: the update binds it too.

  Nothing else moves. An upsert whose `columns` and `insert` share no column is listed as it was, and no write runs, is refused or lands differently. Inside, the signature, the required keys and the `$returned` check now read what a statement sets through one function.

  **What to change:** nothing.

## 0.2.2

### Patch Changes

- 008b5e8: README and DOCS corrections. The exported `Query` type requires `dir` on a `sort` entry; in hand-written JSON it may be left out and reads as `asc`. `compile` and `test` work with no model, not with no database: both need the introspected schema, and `test` runs the query. The "N counts in one row" example compiles but throws at execute (`08P01`) under a policy that row-scopes two of its tables, because each such subquery binds its own `$scope` param; under such a policy, read each count on its own. No code changed.

  **What to change:** nothing.

## 0.2.1

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

- 1e6d55d: A pool's `query` and `transaction` are called on the pool, and a transaction's `query` on the transaction — never taken off the object first. A driver's own object has them as methods that need their receiver, and taken off they failed inside the driver, on a property nothing in nisc names:
  - **strata** — `migrate` and `upgradeStore` over a `PGlite` threw `Cannot read properties of undefined (reading '_checkReady')`; `status` and `readLedger` did too, once a ledger existed. A pool whose `transaction` hands a checked-out `pg` client through as the transaction failed in `migrate` the same way.
  - **moss** — `createTideStore` took `query` off the transaction. Over a pool that hands its client through, every transaction of the store failed inside the driver, and tide recorded the run as deferred: nothing threw, and the effect never ran.
  - **vex** — `createPostgresAdapter` with a read limit set (`limitReads`) threw on a pool whose `transaction` is a method.

  A `PGlite` now works as a pool as it is, and so does a `pg` wrapper that passes its client through. A pool built from closures (`createPglitePool`, a wrapper that builds its own `query`) behaves as before.

  **What to change:** nothing.

- 5c70059: Vex hashes without `node:crypto`, so `@niscorp/vex` and `@niscorp/vex/pglite` build for a browser as they are.

  Every identity vex computes — `computeRequestHash`, `computeSchemaFingerprint`, the policy key behind the negative cache, a minted `fp_…`, and the row and answer hashes of a reactive read — is a SHA-256, and it came from `createHash` in `node:crypto`. A page has no such module, so a bundler refused the package (`"createHash" is not exported by "__vite-browser-external"`), and every app that runs vex over PGlite in the browser pointed its bundler's `crypto` at a shim of its own.

  The hash is now vex's own (`src/utils/sha256.ts`): synchronous, self-contained, and the same digests as node's byte for byte. Nothing stored moves — a cache row's `request_hash` and `schema_fingerprint`, a `neg:` key and a fingerprint computed at build time by Node all still match what a page computes. The exported functions keep their signatures. It costs about three times node's own hash: 0.003 ms for a request identity, about 0.6 ms per 100 KB of rows.

  **What to change:** nothing. An app that aliased `crypto` (or `node:crypto`) to a shim for vex can delete the alias, the shim and the dependency behind it.

## 0.2.0

### Minor Changes

- f1cec45: A Prism config that validates no longer names an op Prism does not have. `validate` accepted `{ card: { $fetch: … } }` and `{ $eval: "…" }`: the plain-object branch refused only the names of ops that exist, so any other `$` key passed as a template key. Such a config could be stored — an endpoint request, a vex mapping, a strata migration — and then failed every time it was evaluated (`E_NODE_SHAPE`, "Unsupported node shape").

  A key that starts with `$` is now an op's name and nothing else. The template branch refuses every `$` key — the rule the evaluator already held — so `validate` reports it with the key and where it is (`card.$fetch: Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.`), and `evaluate` and `compile` fail with `E_SCHEMA` before anything runs. An op's name used as a template key keeps its own message. `E_NODE_SHAPE` is left for a tree that never went through the schema: an IR handed to `execute`. Adding an op no longer takes a key away from templates.
  - **prism** — the change, and a grammar narrowing: `nisc.prism` 2, a marker with no document step (a key that never evaluated has nothing to be rewritten to). `$` keys that are data are untouched: a `$const` payload, `$with` names, `$renameKeys` and `$fromEntries` keys. The JSON Schema's template key pattern is `^(?!\$)` instead of a list of every op.
  - **nova, vex, moss, loom, cli, nisc** — no change of their own. They depend on prism and are released with it, so the set installs together; the configs they hand to prism (endpoint `request` and `response`, `$prism` bindings, vex mappings) are held to the same rule.
  - **create-nisc** — the templates' sources are recorded at `nisc.prism` 2.

  **What to change:** in a config with a `$`-prefixed key that is not a Prism op, remove the key — or put the object in `$const` if it is literal data. An app that keeps a `strata.lock.json` runs `pnpm strata upgrade`, then `pnpm strata verify`; there is nothing to edit unless it has such a config. Everything else: nothing.

  BREAKING — approved by moccadroid, 2026-10-04: a config with a `$`-prefixed key that is not a Prism op no longer validates, compiles or evaluates — also where evaluation never reached the key (an untaken `$case` branch, a short-circuited `$or`, a `$map` body over an empty array), which used to work. A vex seed mapping with one fails when it is seeded, at boot, instead of on each replay. Code that matched `E_NODE_SHAPE` from `evaluate` gets `E_SCHEMA`. The `@niscorp` packages that depend on prism move with it, so an app moves them together (`@niscorp/nisc` 0.3.0).

### Patch Changes

- Updated dependencies [f1cec45]
  - @niscorp/prism@0.2.0

## 0.1.1

### Patch Changes

- 45d6731: `DELETE` on an unlocked fingerprint endpoint refuses a protected mutation entry with 409 `fingerprint_protected`, as it already did a protected read. A seeded write could be evicted by anyone who could reach the endpoint. A locked endpoint (every endpoint moss serves) was never affected.
