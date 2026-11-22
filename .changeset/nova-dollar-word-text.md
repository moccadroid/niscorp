---
"@niscorp/nova": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on text such as `'$CAD only'` rendering empty, on such text not reaching `onPhraseMiss`, or wrote a condition that way: `{ if: '$count > 0', then, else }` (or a `$if: '$count > 0'` directive) with `count: 0` took `else` and now takes `then`, because the string is text, which is truthy.

A string that starts with `$` and a name followed by more words (`'$CAD only'`) is text: it renders as written, where it rendered empty, and, being text, is offered to the phrasebook (`onPhraseMiss` hears of it). Every path that resolved still resolves: `'$.x'` forms, `'$'` alone (the innermost scope), `'$USD'` (a path, empty when there is no `USD`), non-ASCII keys (`'$item.größe'`) and a path with trailing space. Only a data key with a space in it, read the `$name` way, is read differently.
