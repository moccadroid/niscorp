---
"@niscorp/vex": patch
---

BREAKING (pending consolidation): nothing unless an app's discovery endpoint has an engine created with `scope` and a handler with no policy of its own (Express without `getPolicy`, Hono without `getPolicy`, or `handleDiscovery` called directly) and relied on that endpoint listing tables and entries the engine's policy refuses to run.

Discovery now lists under the policy a query on that endpoint runs under: the handler's (or the request's) policy when there is one, otherwise the engine's. `QueryEngine` gains an optional read-only `scopePolicy`, the policy given to `createQueryEngine`.
