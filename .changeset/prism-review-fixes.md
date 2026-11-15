---
"@niscorp/prism": patch
---

Prism reads and writes only the data's own keys: `$.constructor` on `{}` is a missing path instead of a JavaScript function, `$groupBy` groups under `constructor` or `toString` instead of throwing, and a key called `__proto__` in the data stays a key of the result in `$merge`, `$omit`, `$pick`, `$keyBy`, `$fromEntries` and `$renameKeys`.

`$localeDate` and `$localeNumber` refuse a locale Intl does not read (`de_AT`) with a Prism type error (`E_TYPE`) instead of a bare `RangeError`.

A source nested deeper than the call stack reaches is stopped with `E_BUDGET` instead of a bare `RangeError`.

The cache of parsed `$ref` paths keeps at most 1,000 paths; it grew with every distinct path a process saw.

A config still cannot carry a key called `__proto__`: validation drops it from a plain object, a `$const` payload, a `$with` binding or a `$renameKeys` map while `validate` answers ok. DOCS.md says so; data with such a key comes in through the source.

With `check: 'always'`, a source that contains itself is refused as not JSON (`E_TYPE`, "source.self refers back to source").
