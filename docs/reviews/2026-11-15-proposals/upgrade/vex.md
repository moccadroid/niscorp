# Upgrading past the vex "Owner to confirm" fixes

Five changes in `@niscorp/vex`. None changes a grammar (no vex entry, query or mutation schema changed, so no strata migration and no lock moves) and none changes a table: the "last used" stamp writes the `last_used_at` column the Postgres cache already has. No lab app had to change.

Each item says who is affected among the lab apps (`apps/lab/*`) and the three apps outside this repo (AnimaApp, anima-finance, mira). The outside apps reach vex only through moss, through their entry files (`src/app/vex/*.entries.ts`), and through moss's `/api/vex` routes. None of them calls `mergeScopePolicies`, `handleDiscovery`, `createQueryEngine` or a cache directly, and none uses `upsert`.

### vex — discovery lists only what the engine's policy lets run, when the handler has no policy of its own
- Before: `createQueryEngine({ adapter, scope: tenantOnlyPolicy })`, mounted with Express without `getPolicy` (or Hono without `getPolicy`, or `handleDiscovery({ engine })` called directly). `GET` listed every table, the denied `secrets` table included with all its columns, and every fingerprint with its intent, context and write effect, although a query there runs under the engine's policy and is refused `secrets`.
- Now: the same `GET` lists `tasks` and only the entries that policy lets run; `secrets` and `secrets/all` are not listed. A handler or request policy, when there is one, still decides alone. `QueryEngine` has a new optional read-only `scopePolicy`: the policy given to `createQueryEngine`. Each table's `rowCount` is unchanged (still the whole table's count).
- Who notices: an app whose discovery endpoint has an engine with `scope` and no handler policy, and that reads that listing.
- What to do: nothing, unless a client relied on seeing tables or entries the engine refuses to run. To list more, give the handler its own policy (`scopePolicy`, or `getPolicy` on an adapter).
- Breaking: yes (a listing gets shorter).
- Affected apps: none.
  - `apps/lab/fable/src/vex/http/fetch.ts:34` calls `handleDiscovery({ engine, entities: ENTITIES })` on an engine with `scope: scopePolicy` (`apps/lab/fable/src/vex/runtime.ts:29`). That policy is `default: 'allow'` with no entities (`apps/lab/fable/src/vex/scope.ts:5`), so the listing is the same; fable's `check` passes.
  - `apps/lab/relay/src/dev/engine.ts:100` passes its own `scopePolicy`: unchanged.
  - moss passes a policy on every discovery call, so AnimaApp, anima-finance, mira and lyceum see the same `GET /api/vex`.

### vex — an `upsert` with a `null` key inserts where the database makes the key
- Before: `{ op: 'upsert', table: 'tasks', key: 'id', columns: { title: … } }` called with `{ id: null, title: 'new' }` ran `UPDATE … WHERE id = NULL`, wrote nothing, and answered 200 `[]`, even when `tasks.id` has a default (`gen_random_uuid()`, a sequence).
- Now: where the introspected key column has a default, it inserts the row and answers it (`{ id: '6249…', title: 'new' }`). On a key column with no default it is still an update of no row and answers 200 `[]` (an insert there would break the key's `NOT NULL`). An absent key or `''` inserts, as before.
- Who notices: a client that sends `null` as an upsert's key.
- What to do: nothing. A client that sends `null` to mean "new" now gets the row it asked for.
- Breaking: yes (a request that wrote nothing now writes a row).
- Affected apps: none. relay's upserts (`apps/lab/relay/src/app/vex/tasks.entries.ts:147` and the companies, contacts and deals entries) are sent `id: ''` for a new record (`apps/lab/relay/src/app/actions/domains/*/*.form.action.ts`), never `null`. No other lab app and no outside app has an `upsert` entry.

### vex — a read's context value that does not fit its column is a 400; the error log drops bound values
- Before: `{ fingerprint: 'tasks/byIds', context: { ids: 't1' } }` on `in: ['tasks.id', { $context: 'ids' }]`, or `{ min: 'abc' }` on an integer column, answered 500 `{ error: '22P02', message: 'malformed array literal: "t1"' }`. The server logged the whole driver error object; under PGlite that includes the SQL and every bound value (`params: [0, 'tenant-A']`), the caller's scope among them.
- Now: the same requests answer 400 `{ error: 'invalid_request', message: 'Context value "ids" does not fit its column: malformed array literal: "t1"', details: { key: 'ids', code: '22P02' } }`; `engine.execute` throws that `VexError`. This applies only when Postgres's error names the bound parameter (`unnamed portal parameter $2 = '...'`) and that parameter is one of the statement's context values. Division by zero in a compute, numeric overflow, a bad stored value, and a wrongly typed scope value from the host stay 500, as does a write's context value that does not fit its column. `'42'` for an integer column still runs. The log line for an unexpected error is now `[vex] unhandled error <code> in: <SQL>` followed by the stack, never the error object.
- Who notices: a client that branches on that 500 or on its code (`22P02`, `22003` and so on); anything that parses the old log line.
- What to do: treat the 400 `invalid_request` like any other refused request. A test that expected 500 for its own wrongly typed context value expects 400.
- Breaking: yes (a status and an error code change).
- Affected apps: none found. No lab app's check sends a wrongly typed context value (lyceum, fable and mythos checks pass). The 500 checks in the outside apps are about other endpoints: `AnimaApp/src/dev/stripe-check.ts:129` is a Stripe webhook, and `mira/src/dev/photos-check.ts:142` is a photo upload.

### vex — `mergeScopePolicies` keeps `public` and `write`
- Before: `mergeScopePolicies([{ default: 'deny', entities: { countries: { public: true } } }])` gave `{ entities: {} }`: the public table was refused. A `write` list was dropped: `{ read: [], write: [tenant], update: [] }` merged to `{ read: [], update: [] }`, which is updates across tenants (wider than the policy given to the merge), and a `write`-only entity lost every write phase.
- Now: `public` merges to all four phases with no rule (`{ read: [], insert: [], update: [], delete: [] }`). `write` is added to insert, update and delete (its `match` rules only, for delete), as `createScopePolicy` does: that example merges to `{ read: [], insert: [tenant], update: [tenant], delete: [tenant] }`. A `deny` still grants nothing, so another role's grant stands. Two rule sets with the same number of matches are still not combined, and `default: 'allow'` is still not carried over.
- Who notices: only code that merges hand-written policies. Wider: a `public` table, and the write phases of a `write`-only entity, are now granted. Narrower: `{ write: [tenant], update: [] }` now updates only the tenant's rows; an update across tenants that worked through the old merge matches no row and answers `[]`.
- What to do: nothing for policies made by `createScopePolicy` (moss's are), which merge exactly as before. If a hand-written policy relied on the old merge, write the merged rules out by hand.
- Breaking: yes, for hand-written policies only.
- Affected apps: none. moss (`packages/moss/src/data/policy.ts:13`) and showroom (`apps/showroom/src/modules/charter/world/studio.ts:77`) merge only `createScopePolicy` output. No lab app and no outside app calls `mergeScopePolicies`.

### vex — the "last used" stamp writes `lastUsedAt` alone
- Before: a replay that was due a stamp wrote `{ ...entryItRead, lastUsedAt }` back through `cache.set`. A `PATCH` (unprotect) or a reseed that landed between the replay's read and its stamp was undone. The tiered cache's `set` copied its L1 entry over the shared L2, so a process holding an old L1 copy overwrote another process's change.
- Now: `CacheBackend` has an optional `touch(key, lastUsedAt)` that writes that one field. Memory and Postgres implement it (Postgres runs `UPDATE … SET last_used_at = $2 WHERE key = $1`), and the tiered cache does when both its levels do: L1's `touch`, then L2's. The engine and the handler stamp through `touch` when the cache has it, and through `set` with the whole entry when it does not.
- Who notices: a host that wraps a built-in cache by spreading it and overriding `set` to watch writes. The wrapper inherits `touch`, so the stamps no longer reach its `set`; every other write still does.
- What to do: a wrapper that counts or forwards stamps also overrides `touch` (vex's own `test/cache/touch.test.ts` now does). A custom backend need not implement `touch`.
- Breaking: yes, for such a wrapper only.
- Affected apps: none change behaviour. lyceum's runtimes build a tiered cache (`apps/lab/lyceum/src/server/postgres-runtime.ts:17`, `apps/lab/lyceum/src/server/runtime.ts:20`), but moss wraps every cache in its `createEntryCache` (`packages/moss/src/data/engine.ts:24`), which has no `touch`. So every moss app (lyceum, AnimaApp, anima-finance, mira) still stamps through `set`, as before. mythos and fable use `createPostgresCache` directly (`apps/lab/mythos/src/vex/engine.ts:18`, `apps/lab/fable/src/vex/runtime.ts:24`) and now stamp through its `touch`; their checks pass.
