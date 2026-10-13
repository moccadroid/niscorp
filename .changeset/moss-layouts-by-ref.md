---
'@niscorp/moss': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

Moss keeps every action's layout in the shell's layout store, under `action/<id>`. A layout that changes now reaches a screen that is already open. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-12: a manifest's `layoutStore` declares no name beginning with `action/`, no action's layout and no layout variant names a ref under it, and code that takes the whole shell (`unverifiedShell(session)`) to read an action's layout off a definition reads it from the layout store (`shell.layoutStore.get('action/<id>')`).

- **An open screen follows a layout that changed, with its data kept.** A set of actions handed over with `server.replaceActions` used to reach only a screen opened afterwards: an instance that was open kept the layout it was opened with. What an open instance still keeps is the rest of its definition (its data's shape, its endpoints, its triggers).
- **Where the layout is kept does not show to an app.** An app writes an action's layout in its definition as before. `server.actions()` answers it as written, and so does a definition read off a session's shell (`session.shell.getRuntime(id).definition`), with the layout the screen is drawn with now in place. Inside nova's own shell, which `unverifiedShell(session)` hands out, the definition names its layout by `{ ref: 'action/<id>' }` and the store holds the layout, or the layout variant the person's roles hold. An action with no layout, or one whose `layout` is the name of a stored layout, is handed over as it is.
- **A session's shell hands out its layout store to read.** `set` and `delete` on `session.shell.layoutStore` throw, as `setLayout` does. They went through before.
- **`action/` is moss's in a layout store.** A manifest whose `layoutStore` declares a name beginning with it, in the app's shell or in a page, refuses the boot and says where. So does an action's layout or a layout variant that names one, at boot and when a set of actions is handed over: a layout cannot be drawn inside itself.
- **The layout of an action that leaves a shell is taken out of its store.**
- **The shell's own layout and a canvas's are kept in the store too**, under `frame` and `canvas/<id>`, and the shell draws each by that name. An app writes `layout` and a canvas's `actionLayout` as before, and a screen is drawn as before. A manifest whose `layoutStore` declares `frame`, or a name beginning with `canvas/`, in the app's shell or in a page, refuses the boot and says where.
- **Whether a page can still do something is read through every ref.** A layout a screen names by `{ ref }` is read where the store holds it, so a two-way bound field in a stored layout the app names itself makes its page live. It was missed before, and such a page was reported as a file.
- The CLI and `@niscorp/nisc` change in the moss they bring.
