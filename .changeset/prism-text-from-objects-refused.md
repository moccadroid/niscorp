---
'@niscorp/prism': patch
---

`$join`, `$interpolate`, `$keyBy` and `$groupBy` refuse an object or a list where they need text, with `E_TYPE` and a message that says which item or key and what it was. They turned it into text with `String()`: an object became `"[object Object]"` and a list its items joined by commas, and nothing said so.

- `$join`: a part that is an object or a list (`$join.parts needs items that are text, a number, true, false or null, but item 1 is an object: {"a":1}.`). `null` is still `""`.
- `$interpolate`: a value for a `{{key}}` in the template that is an object or a list. A value the template does not use is not looked at, and a missing one is still `""`.
- `$keyBy` and `$groupBy`: a key that is an object or a list. Text, numbers, `true`, `false` and `null` are keys as before.

**What to change:** a config that joined or interpolated an object or a list, or grouped by one, now fails instead of answering `"[object Object]"` or `"a,b"`. Pick the field you meant (`$get`), or join the list first (`$join`).
