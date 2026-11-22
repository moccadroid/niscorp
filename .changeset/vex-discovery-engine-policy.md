---
"@niscorp/vex": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app's discovery endpoint has an engine created with `scope` and a handler with no policy of its own (Express without `getPolicy`, Hono without `getPolicy`, or `handleDiscovery` called directly) and relied on that endpoint listing tables and entries the engine's policy refuses to run.

Discovery now lists each table and entry under the policy it runs under. Tables and read entries go by the handler's (or the request's) policy when there is one, otherwise the engine's. A write entry goes by `mutations.policy`, the policy its write runs under, when the handler has `mutations`. `QueryEngine` gains an optional read-only `scopePolicy`, the policy given to `createQueryEngine`.
