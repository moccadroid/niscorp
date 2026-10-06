---
"@niscorp/vex": patch
---

A seeded entry runs with the `limit` its author wrote, past `maxLimit`.

`maxLimit` (1000 by default) clamped every query, including one a developer wrote and seeded: a seeded entry that stated a larger `limit` ran with `maxLimit` in its place, and the reply did not say so.

`maxLimit` now clamps only a query nobody reviewed — one generated for a request. An entry seeded with `seedCache` runs with the `limit` it states. Which kind an entry is comes from the stored row and not from the request: protected, with no request hash. That is what `seedCache` writes, and what a host writes when it stores an entry through the cache backend itself; no request can produce it. A generated entry stays clamped when it is replayed, when it is stored under a name the caller chose, and when it is protected afterwards. `engine.compile` takes a bare query and clamps as before; `engine.test` still runs with a limit of 5.

One edge: a generated entry that was protected and is then seeded with the identical definition keeps its request hash, because `seedCache` leaves a row that already matches alone. It stays clamped, and its reply says so, until it is unprotected or deleted and seeded again.

**This changes what an existing app receives in one setup:** a read entry the host stored itself — seeded, or written protected through the cache backend — whose `limit` is above the engine's `maxLimit` returned `maxLimit` rows and now returns up to its stated `limit`. Nothing changes for an entry that states no limit, one that states `maxLimit` or less, a generated query, or a mutation.

**What to change:** nothing, if the larger answer is what the entry was written for. To keep the clamp on seeded entries, set `config.capAuthored: true` on the engine (under moss: `runtime.vexConfig: { capAuthored: true }`).
