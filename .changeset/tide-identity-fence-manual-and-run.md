---
"@niscorp/tide": patch
---

BREAKING (pending consolidation): nothing unless an app relied on a `manual` fact ingested under one identity (or none) running a reflex of another identity, or on `ingest` accepting a `kind: 'run'` fact.

A `manual` fact now passes the identity check before it skips `enabled` and arming: `ingest({ kind: 'manual', target: 'b.refund' }, { as: 'tenant-a' })` no longer runs tenant B's reflex. `fire` mints the fact under the reflex's own identity, so firing by hand works as before, on a disabled reflex too.

`ingest` refuses a `run` fact with `invalid_fact`: tide mints one when a run settles, and an ingested one would forge that settlement.
