---
'@niscorp/prism': patch
---

A plain object template is recognised before the ops are tried, not after: `execute` and `evaluate` are up to four times faster on configs that are templates.

A template such as `{ id: { $ref: '$.id' }, name: … }` is not an op, so the compiler attaches no handler to it, and the evaluator reached it only after asking about sixty times whether it was some op. It did that on every evaluation, in a compiled tree too, and once for each row where the template is the body of a `$map`. A template has no `$` key and every op needs one, so asking for the template first changes no answer.

Measured, Node 24, one order unless said:

| | before | now |
|---|---|---|
| `execute`, four fields picked and renamed | 1.32 µs | 0.31 µs |
| `execute`, a nested shape with mapped lines | 7.63 µs | 1.77 µs |
| `execute`, three strings built | 3.24 µs | 1.20 µs |
| `evaluate`, four fields | 4.15 µs | 3.17 µs |
| `execute`, a total for each of 10,000 orders | 30.4 ms | 19.8 ms |

A config whose time is in sorting, filtering or summing is as fast as it was.

**What to change:** nothing.
