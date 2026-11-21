---
"@niscorp/vex": patch
"@niscorp/moss": patch
---

`engine.execute` can serve a replayed entry at the `reach` it declares: pass `policyForReach`, as the handler takes it. Without it the run is as before, with one warning per entry. moss's `session.answerIntent` passes it, so a replay of an entry that declares a reach answers what `/api/vex` answers the same person: fewer rows, or `scope_denied` for roles with no such reach.
