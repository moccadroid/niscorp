---
'@niscorp/nova': minor
'@niscorp/loom': minor
---

`createDevtoolsFunctions` answers a list of `{ id, description, execute }`, and `FunctionDefinition` names that shape. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-18: `createDevtoolsFunctions(config)` returned a map of handlers by name; it returns `FunctionDefinition[]`, each with a description of what it does and what to send. An app that spread the map into its functions spreads the list into the list its `functions(session)` answers: `functions: (session) => [...createDevtoolsFunctions({ shell: () => session.shell, definitions }), ...]`.
