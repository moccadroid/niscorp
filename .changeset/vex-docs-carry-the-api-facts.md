---
'@niscorp/vex': patch
---

DOCS.md and DESIGN.md state twenty facts about the API that were written only in source comments.

Among them: the adapter's `exclude` option and `statementTimeouts: false` on a pool; what `scopeBindings` returns; that a composite foreign key is one relation joined on every pair; that a behavior's `write` rules apply to every write verb; when an `upsert` inserts; that nothing in vex calls `sweepCache`; what the Postgres and tiered caches hand `onError`; that `signal` and `onChange` only work together; what the hono adapter does when `getPolicy` returns `undefined` and when no policy covers a write; and what an adapter's `limitReads` and `validateEntry` return.

No behaviour changed.

**What to change:** nothing.
