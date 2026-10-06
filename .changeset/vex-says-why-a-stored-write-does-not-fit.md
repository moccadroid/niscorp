---
"@niscorp/vex": patch
---

`mutationMisfits(def, schema)`: why a stored write does not fit a schema, without running it.

Every write passes two column gates before it runs: its table, the columns it writes, its WHERE, its `$lookup`s and its conflict target must be the schema's, and so must a column it reads from an earlier statement (`$returned`). Those gates could only be met by running the write.

`mutationMisfits` asks them and runs nothing: one sentence for each refusal, none when the write fits. An upsert is asked as both statements it can become. Scope is not applied — what a policy stamps or bounds is checked where the principal is known.

**What to change:** nothing.
