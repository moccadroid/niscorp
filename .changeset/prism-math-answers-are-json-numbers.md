---
"@niscorp/prism": patch
---

BREAKING (pending consolidation): nothing unless a config relied on an overflowing `$add`, `$sub`, `$mul`, `$div`, `$sum` or `$avg` giving `Infinity` (which JSON stores as `null`): it is now an `E_TYPE` error.

`$add`, `$sub`, `$mul` and `$div` refuse an answer that is not a JSON number. `{ "$mul": [1e308, 10] }` and `{ "$div": [1, 5e-324] }` are `E_TYPE` ("$mul gave Infinity, which is not a JSON number."), where they returned `Infinity`. `$sum` and `$avg` run as `$add`, so a sum past what a number can be is refused the same way: "$add gave Infinity, which is not a JSON number. At $sum, in the $add that $sum runs as."
