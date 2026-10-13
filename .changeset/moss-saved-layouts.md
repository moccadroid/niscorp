---
'@niscorp/moss': patch
'@niscorp/nisc': patch
'@niscorp/cli': patch
---

Moss keeps a layout that was generated while the app runs, for the person who saved it.

- **`session.artifacts`, on the session an app's functions are handed.** `save`, `list`, `history`, `restore` and `reset`. A layout is saved for the action it is for (`{ kind: 'layout', body: { ref: 'action/<id>', layout, use? } }`). It is the session's principal's alone, gets its id from moss, and is drawn on their screens while it is marked `use: true`; their open screens follow at once, with their data kept. Who may save is the charter's: the function that calls it is the app's, and the charter says who holds the action that calls that function. A session nobody is signed in to saves nothing.
- **A row is its principal's, and vex keeps it so.** Moss reads and writes the two tables as the caller, under one row rule: a caller reads and writes only the rows whose `principal` is their `userId`, and a row they insert or update carries it. No call names whose rows are meant. The same rule is part of the policy an app's charter compiles to, so a role that is granted the tables, by name or by a wildcard, reaches its own rows there and nobody else's. An app's `behaviors` that name `artifacts` or `artifact_saves` refuse the boot.
- **Under an action's ref a shell draws**, the first of these there is: the person's own layout marked in use, the layout variant their roles hold, the build's.
- **Every save is a version, and moss changes and deletes none.** Going back to a version is a new save that holds a copy of it; a reset is a new save that says none is in force, and the layout under it is drawn again.
- **A layout is checked when it is saved and when a shell is built**: its shape, that the action it is for has a layout of its own and is held by whom it is saved for, its components against what the app's shells have, that it names no ref under `action/`, and what nova's audit finds of its action with the layout in place and not of the action as it is built. A save is refused with a sentence. A saved layout that no longer passes is left out with a line in the log, and what is under it is drawn.
- **Two tables, in migration `nisc.moss/5`: `artifact_saves` and `artifacts`.** A deployment that boots with `migrations: 'verify'` runs `nisc migrate` first, as for every migration. An app whose database already has a table by either name renames its own before it takes this release.
- **The fabric carries one more message, `adopt`**: it names a principal and tells a process to bring the shells it holds for them level. A process that runs an earlier release drops it as a message it does not know, as it drops every such message.
- Not built yet: a default that is saved for everybody; saving an action, a fragment or a vex read; the layout of the frame or of a canvas; a draft.
- The CLI and `@niscorp/nisc` change in the moss they bring. `AGENTS.md` gains rule 7b: how a layout generated while the app runs is saved, and that the charter decides who may.
