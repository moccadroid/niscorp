---
"@niscorp/prism": patch
---

BREAKING (pending consolidation): nothing unless a config relied on `$round` with `digits` above 0 giving the binary-product answer, or a stored number was rounded that way: the same input now rounds to a different number.

`$round` rounds a number at its decimals as they are written, not at `value × 10^digits`. With `digits: 2`: `1.1` with `"ceil"` is `1.1` (was `1.11`), `4.35` with `"floor"` is `4.35` (was `4.34`), `1.005` to the nearest is `1.01` (was `1`), `0.285` is `0.29` (was `0.28`). More digits than a number has give the number (was `NaN` for `digits: 400`, or `1e300` at 10 digits). With `digits: 0` every answer is the same as before.
