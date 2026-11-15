---
"@niscorp/vex": patch
---

DESIGN.md's first design decision states the rule without the history of the defect it replaced.

An `exists` inside a `case` inside an aggregate (`sum`, `count`, …) compiles, with the caller's row rules inside it, as it already did inside `compute`. Before, the query was refused with "An `exists` filter was not resolved".

The Express adapter takes `getPolicy(req)`, `getPolicyForReach(req, reach)` and `onExecute`, as the Hono adapter does. An entry that declares a reach is served there; before, it answered 500 on Express. Without these options the adapter behaves as before.

A request whose `intent` or `fingerprint` is `null` is read as one without that key, by `engine.execute` and by the adapters; before, it was refused as `invalid_request`. The exported schemas are unchanged.

`createPostgresAdapter` takes `qualifyTables: true`: with it, reads and mutations name every table with the adapter's `schema` (`FROM "app".tasks`), so an app need not set `search_path`. `introspect()` then reports that name as `namespace` on the `DatabaseSchema`, a new optional field left out of the schema fingerprint. Without the option nothing changes.
