---
"@niscorp/nova": patch
---

`LayoutStore.resolveReferences` on a stored layout that refers to itself returns, leaving the inner `{ ref }` for the renderer, instead of overflowing the stack.

A canvas placed inside itself (a `CanvasSlot` naming the canvas it sits in) draws `RENDER_ERROR: canvas "<id>" is placed inside itself` where it comes back, in the TTY, DOM, React and Vue adapters, instead of overflowing the stack or running out of memory.

A `GET` endpoint with a `request` body, which fetch refuses on every call, is reported to `onError` as a `DefinitionValidationError` by `createShell` and `registerAction`; the definition still loads as before.

A bound `Input` takes `replaceDraftOnWrite: true`: while it is focused, a change of the value at its model path, other than an echo of a value it dispatched since it was focused, replaces what is typed and drops a pending debounced dispatch, in the DOM, React, Vue and Ink adapters (Ink's is not covered by a test). A write that leaves the stored value as it was changes nothing. Without the prop, a focused field keeps what is typed, as before.

Docs say what the code does: the event bus does not validate events; in lax mode `clear` on a missing or wrong-typed path removes the key; a negative `removeAt` index counts from the end; a push to an undeclared canvas creates a canvas the shell layout does not show; `removeAction` on a list canvas re-runs the mount and resume hooks of the card left last; inside a loop `$.index`, `$.items` and `$.<as>` read the loop's values, a lone `$` is the innermost scope, and `'$USD'` is a path. The endpoint example no longer sends a bearer token from action data.
