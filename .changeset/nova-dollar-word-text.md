---
"@niscorp/nova": patch
---

BREAKING (pending consolidation): nothing unless an app relied on text such as `'$CAD only'` rendering empty, or on such text not reaching `onPhraseMiss`.

A string that starts with `$` and a name followed by more words (`'$CAD only'`) is text: it renders as written, where it rendered empty, and, being text, is offered to the phrasebook (`onPhraseMiss` hears of it). Every path that resolved still resolves: `'$.x'` forms, `'$'` alone (the innermost scope), `'$USD'` (a path, empty when there is no `USD`), non-ASCII keys (`'$item.größe'`) and a path with trailing space. Only a data key with a space in it, read the `$name` way, is read differently.
