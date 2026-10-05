---
"@niscorp/loom": patch
---

A document whose root is a list, a string, a number, a boolean or a tuple opens with its seed.

`createLoomEditor.open` passed a document's seed on only when it was an object. A seed its schema accepts but that is not one — `['stalls', 'circle']` for `z.array(z.string())`, `42` for `z.number()`, a string for a union with a string branch — was dropped, and the default opened in its place. `<LoomEditor>` reports its documents on mount, so a host that saves on change wrote that default over the stored document before any edit. The Prism plugin reached it too: a config that is a literal or a list of nodes (`7`, `[{ $ref: '$.a' }, …]`) opened as `{ "$ref": "" }`.

Such a seed is now what the editor opens with, reports, and draws.

Nothing else moves. A seed the schema refuses for one of these documents still opens the default, as before; an object document, and what it does with a seed that is or is not an object, is untouched; and no exported type changed — `CompileOptions.value` is as it was.

**What to change:** nothing.
