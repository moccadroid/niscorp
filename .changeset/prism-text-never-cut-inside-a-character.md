---
"@niscorp/prism": patch
---

BREAKING (pending consolidation): nothing unless a config cut or split text with emoji or other characters outside the Basic Multilingual Plane and relied on getting half a character (which Postgres jsonb refuses and a browser shows as �).

`$slice`, `$take` and `$drop` never cut text between the two halves of one character: a cut there moves to the near side of it. `start` 0, `end` 5 of `"Hey 👍 there"` is `"Hey "` (was `"Hey \ud83d"`), and `$take 1` of `"👍"` is `""`. `$split` with `sep: ""` splits into characters: `"a👍"` → `["a", "👍"]` (was three items). Indexes stay UTF-16 units, so every result that was whole text is the same. `$length` still counts UTF-16 units, as zod does, and now says so.
