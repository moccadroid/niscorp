---
'@niscorp/moss': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

`functions(session)` returns a list of `FunctionDefinition`, `{ id, description, execute }`, and `session.functions()` lists each function a session may call with its description.

```ts
functions: (session) => [
  {
    id: 'notes.archive',
    description: 'Archives one of the person’s notes. Send { id }.',
    execute: async ({ id }, signal) => archive(session, id, signal),
  },
],
```

- **`id`** is what the charter's `functions` and every `fn:` endpoint name. **`execute`** is what an `fn:` endpoint calls, `(data, signal) => Promise<unknown>`, as a handler in the map was. **`description`** says what it does and what to send, for the model that writes a call to it: `session.functions()` answers `[{ id: 'notes.archive', description: '…' }]`.
- **Two functions under one id are refused** when a shell is built: `moss: functions(session) returned "auth.leave" twice.`
- **A map of handlers by id still works, and is deprecated.** `server.checkFunctions()` builds nobody's shell once and says what to change, read off what that session was given: `[moss] functions(session) returned a map of handlers, which is deprecated: return a list of { id, description, execute }.`, or, for a list, `[moss] functions with no description: auth.leave. Give each a description.` An empty description counts as none; such a function, and one given by a map, is listed by its id alone.
- `FunctionDefinition` is exported, for a helper that returns some of an app's functions.

For whoever upgrades an app, person or agent: turn the map into a list, one `{ id, description, execute }` for each handler, the id being its key; a helper that returns part of the map returns part of the list, and the parts are joined with `[...a, ...b]`. Write each description as what the function does and what to send.
