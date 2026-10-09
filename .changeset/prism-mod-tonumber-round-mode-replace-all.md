---
'@niscorp/prism': patch
'@niscorp/loom': patch
---

Four additions to Prism, and its grammar is at version 3.

- **`$toNumber`** — a number from a number or from numeric text, as a form, a CSV or an API often sends it: `{ "$toNumber": { "value": { "$ref": "$.price" } } }`. Text is read when it is a number written in digits (`"42"`, `"-3.5"`, `".5"`, `" 1e3 "`). Anything else — `""`, `"12 kg"`, `"1,234"`, `true`, `null` — throws `E_TYPE`, or answers `fallback` where one is given. No other op converts: `$add` on `"4"` is still an error.
- **`$mod`** — the remainder of a division: `{ "$mod": [{ "$ref": "$.row" }, 2] }`. It takes the sign of the divisor, so with a positive divisor it is never negative (`[-1, 5]` is `4`, where JavaScript's `%` gives `-1`). Throws `E_DIVISION_BY_ZERO` for a zero divisor.
- **`$round` takes `mode`** — `"floor"` rounds down and `"ceil"` up, at the same `digits`. Without it, it rounds to the nearest, as before.
- **`$replace` takes `all`** — `all: true` replaces every occurrence. Without it, the first, as before. `search` is text, not a pattern.

`MAPPING_OPS` includes `$mod` and `$toNumber`, and loom's Prism editor lists both under Math.

**The grammar.** `nisc.prism` goes from 2 to 3 with one migration that rewrites nothing: these are additions, and a reader at 2 must refuse a config that uses them. The same entry records the narrowing made earlier in this release — a `$ref` path that is not keys and indexes is refused — which the JSON Schema does not show.

**What to change:** an app that keeps Prism configs in its source moves its stamp: `npm run strata upgrade`, then `npm run strata verify`. There is nothing to edit; `strata.lock.json` goes to `nisc.prism 3`. A config written before parses to exactly what it did, so a compiled IR's fingerprint does not move.
