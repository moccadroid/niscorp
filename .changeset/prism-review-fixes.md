---
"@niscorp/prism": patch
---

Prism reads and writes only the data's own keys: `$.constructor` on `{}` is a missing path instead of a JavaScript function, `$groupBy` groups under `constructor` or `toString` instead of throwing, and a key called `__proto__` in the data stays a key of the result in `$merge`, `$omit`, `$pick`, `$keyBy`, `$fromEntries` and `$renameKeys`.

`$localeDate` and `$localeNumber` refuse a locale Intl does not read (`de_AT`) with a Prism type error (`E_TYPE`) instead of a bare `RangeError`.

A source nested deeper than the call stack reaches is stopped with `E_BUDGET` instead of a bare `RangeError`.

A `$ref`'s parsed path is kept with its config, instead of in a process-wide cache that grew with every distinct path it saw.
