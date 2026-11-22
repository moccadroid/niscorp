---
"@niscorp/nova": patch
---

BREAKING (pending consolidation): nothing unless an app's translations contain `$$`, `$&`, `` $` ``, `$'` or `$1` and relied on them being read as replacement patterns on text with spaces around it.

A translation applied to text with spaces around it goes in as written: "Price in dollars " with the translation "Preis in US$$" renders "Preis in US$$ ", where it rendered "Preis in US$ ". The same translation already rendered as written on text without spaces.
