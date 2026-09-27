---
"@niscorp/vex": patch
"@niscorp/nisc": patch
---

A generated query can mean the caller. `QueryEngineConfig.behaviors` takes the host's `ScopeBehaviors`, and every generation is handed `GenerationCaller.bindings`: the columns those behaviors bind to a scope key this caller carries, on tables they may read — keys and columns, never values (`scopeBindings`). The query agent is told who the caller is (`describeCaller`) and writes "my name" as a filter on `{ $scope: key }`, bound by the engine; a caller carrying none of the keys has no self and is told so. Behaviors naming a column the database lacks refuse at `introspect`. Additive: `VexQueryDeps.caller` is optional, and an engine without `behaviors` behaves as before.
