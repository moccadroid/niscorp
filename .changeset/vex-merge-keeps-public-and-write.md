---
"@niscorp/vex": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app merges hand-written policies with `mergeScopePolicies` and relied on a `public` entity being refused, or on `{ write: [...], update: [] }` merging to an `update` with no rule.

`mergeScopePolicies` now reads each entity as the phases it grants. A `public` entity grants all four phases with no rule, where it was dropped and so refused. A `write` list is added to insert, update and delete, where it was dropped: `{ write: [tenant], update: [] }` merges to `update: [tenant]` (narrower than before, and as narrow as the policy itself), and a `write`-only entity gains its three write phases. Policies made by `createScopePolicy` merge exactly as before.
