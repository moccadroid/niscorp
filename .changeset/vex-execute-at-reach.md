---
"@niscorp/vex": minor
"@niscorp/moss": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on `session.answerIntent` replaying an entry that declares a `reach` with more rows than `/api/vex` answers the same person; such a replay now answers fewer rows or `scope_denied`.

`engine.execute` can serve a replayed entry at the `reach` it declares: pass `policyForReach`, as the handler takes it. Without it the run is as before, with one warning per entry. moss's `session.answerIntent` passes it, so a replay of an entry that declares a reach answers what `/api/vex` answers the same person: fewer rows, or `scope_denied` for roles with no such reach.
