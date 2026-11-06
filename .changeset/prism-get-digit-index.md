---
'@niscorp/prism': patch
---

`$get` reads a path segment of digits as an index when the value there is a list: `["link", "0"]` reads the first item of `link`, as `["link", 0]` does, and as JavaScript and JSON Pointer read it. Only digits count: `"01"`, `"-1"` and `" 0"` stay keys, and a key asked of a list is refused as before (`E_TYPE`, or the fallback).

Before, `"0"` on a list was a key, which a list does not have: without a `fallback` it threw `E_TYPE`, and with one it answered the fallback for every item, which is easy to miss. A model writing a mapping wrote `["link", "0"]` with a `null` fallback and got `null` for all twelve records; lyra's people roll reads its page cursor with `["0", field]` and has answered `""` every time.

**What to change:** nothing. A config that used a digit key on a list and relied on getting its fallback now gets the item.
