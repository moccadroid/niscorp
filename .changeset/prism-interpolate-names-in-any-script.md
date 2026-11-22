---
"@niscorp/prism": patch
---

BREAKING (pending consolidation): nothing unless a template contains `{{…}}` with a name in a script other than ASCII and relied on the braces staying in the text.

`$interpolate` fills a placeholder whose name is letters, marks, digits and `_` in any script. `"Hallo {{straße}}"` with `{ straße: "A" }` gives `"Hallo A"`, and `""` in its place when `values` lacks the key, as an ASCII name always did; the braces used to stay in the text. A name with other characters (`{{first-name}}`, `{{ name }}`) is still left as written.
