---
'@niscorp/prism': patch
---

`$sortBy` gives every key a place: an item whose key is `null`, a boolean, or a string among numbers is no longer left wherever the sort happened to put it.

`$sortBy` compared numbers with numbers and strings with strings. Any other pair of keys compared as equal, and an item that is equal to everything has no place in an order: where it ended up depended on which items it was compared with, so the same rows in another order came out differently.

Now, where the keys are of more than one kind: numbers first, then strings, then `false` and `true`, and `dir: "desc"` turns that around. An item whose key is `null` is last in both directions. Items with equal keys keep the order they came in.

A list whose keys are all numbers, or all strings, sorts exactly as it did.

**What to change:** nothing. A list that was sorted by a key that is sometimes `null` now has those items at the end.
