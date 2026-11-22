---
"@niscorp/prism": patch
---

BREAKING (pending consolidation): nothing unless a config relied on `$update` turning a list or a scalar on its path into an object, or on `$has` answering `false` for digit text over a list.

`$update` and `$has` read a path as `$get` does: a number, or digit text such as `"0"` on a list, is an index. `$update` at `["items", "0", "qty"]` over a list now updates the first item; it used to replace the list with `{"0": {"qty": …}}` and lose the other items. `$has` with that path answers `true` where the item exists. A key on a list (`"x"`, and `"01"`, which is not index text) or on a string, number or boolean is now `E_TYPE`; it used to replace that value with a new object. A missing key or `null` on the path is still created as an object.
