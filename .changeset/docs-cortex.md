---
"@niscorp/cortex": patch
---

DESIGN.md and the README say what the code does: the loop streams unless `transport: 'step'`, no event carries per-step usage, the schema check is conversion, no `$ref` and at most 8,192 characters (native also needs `nativeJsonSchema` and is sent with `strict: false`), `onRun` is an option of `createManifold`, and `agent.run` takes `agentPath`.

**What to change:** nothing. Documentation only.
