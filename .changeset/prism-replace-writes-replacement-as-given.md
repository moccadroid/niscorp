---
"@niscorp/prism": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a `$replace` replacement contains `$$`, `$&`, `` $` ``, `$'` or `$<name>` and relied on JavaScript reading it as a pattern (writing `$$` to get `$`).

`$replace` writes its `replacement` as given. `"US$$5"` writes `US$$5` (was `US$5`), and `"[$&]"` writes `[$&]` (was the matched text in brackets). DOCS already said `search` is plain text; the replacement now is too.
