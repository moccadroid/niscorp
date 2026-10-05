---
"@niscorp/vex": patch
---

README and DOCS corrections. The exported `Query` type requires `dir` on a `sort` entry; in hand-written JSON it may be left out and reads as `asc`. `compile` and `test` work with no model, not with no database: both need the introspected schema, and `test` runs the query. The "N counts in one row" example compiles but throws at execute (`08P01`) under a policy that row-scopes two of its tables, because each such subquery binds its own `$scope` param; under such a policy, read each count on its own. No code changed.

**What to change:** nothing.
