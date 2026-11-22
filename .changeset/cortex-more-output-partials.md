---
"@niscorp/cortex": patch
---

BREAKING (pending consolidation): nothing unless an app listens to `output-partial` and relied on an agent with such a data schema sending none, or fewer.

More agents stream `output-partial` events, through the newer `@niscorp/solid` cortex uses for them. An agent whose data schema has a field with a constraint (`.min(1)`, `.positive()`, an email or url format), a `z.record` or a `z.lazy` (a recursive schema) emitted no `output-partial` for the whole run, and now emits them as the reply arrives. One with a field that takes any value (`z.record(z.string(), z.unknown())`, `z.any()`) stopped emitting at the first value nested inside that field, and now goes on to the end of the reply. A union field whose value only a later variant takes is kept in the partials instead of dropped. As before, a partial's value can fail the schema until the run ends, and the run's result is checked as before. Measured over the lab apps' schemas: relay's screen builder goes from 0 to 27 events per answer and lyceum's nova layout from 0 to 20; a run handle keeps the extra events until it is dropped.
