---
"@niscorp/nova": patch
---

BREAKING (pending consolidation): nothing unless a layout inside a loop writes through `model: '$.<as>.…'`, `'$.items'` or `'$.index'` and relied on the write landing on a root key of that name.

Inside a loop, a `model` written with `$.` writes where it reads: `model: '$.line.qty'` (with `as: 'line'`) writes the row it shows (`lines.0.qty`), where it wrote a root `line.qty` that no field shows. `model: '$.index'` binds nothing, as `model: '$index'` already did, where it wrote a root `index` while showing the loop index. What every layout shows is unchanged.
