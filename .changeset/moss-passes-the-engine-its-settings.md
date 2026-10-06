---
"@niscorp/moss": patch
---

`runtime.vexConfig` hands the query engine its settings.

Moss built the vex engine with no `config`, so a deployment ran on vex's defaults — 100 rows for a list that states no limit, 1000 at most, a ten-second read timeout — and had no way to change one.

`NiscRuntime` takes an optional `vexConfig`, passed to `createQueryEngine` as its `config` unread: `defaultLimit`, `maxLimit`, `capAuthored`, `statementTimeoutMs` and the rest of `QueryEngineConfig['config']`. Unset, the engine is built exactly as before.

**What to change:** nothing. Set `vexConfig` in your runtime to change one of the engine's numbers — for example `vexConfig: { capAuthored: true }` to keep seeded entries under `maxLimit`.
