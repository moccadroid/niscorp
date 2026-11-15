---
"@niscorp/prism": patch
---

Prism reads and writes only the data's own keys: `$.constructor` on `{}` is a missing path instead of a JavaScript function, `$groupBy` groups under `constructor` or `toString` instead of throwing, and a key called `__proto__` in the data stays a key of the result in `$merge`, `$omit`, `$pick`, `$keyBy`, `$fromEntries` and `$renameKeys`.
