---
"@niscorp/vex": patch
---

BREAKING (pending consolidation): nothing unless an app sends `null` as an `upsert` key on a table whose key column has a database default and relied on that writing nothing and answering `[]`.

An `upsert` whose key is `null` now inserts a row where the database makes the key (the introspected key column has a default, such as `gen_random_uuid()` or a sequence). Before, it ran an update of no row and answered 200 `[]`. On a key column with no default, a `null` key answers 200 `[]` as before.
