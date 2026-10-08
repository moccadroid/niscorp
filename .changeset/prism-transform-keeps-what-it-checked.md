---
'@niscorp/prism': patch
---

`prismTransform` checks a config object once and only evaluates it after that.

It kept the parsed config for each config object, then handed it to `evaluate`, which parsed it again. So every call paid the schema check, and a config that was a new object on each call paid it twice. What it keeps now is the tree an evaluation runs: checked, desugared and optimized, as `compile` makes it.

On a config of three operators (Node 24, zod 4.6.5), the same object passed again: 523 µs before, 1.6 µs now. A new object on each call: 1,047 µs before, 521 µs now.

Nothing else moves. What a config answers and what is refused, and with which error, are as they were. A config changed in place after its first call was not read again before and is not now; DOCS.md says so. A `$const` in a kept config is handed out as a copy, so a caller that changes a result does not change the next one. Each kept config holds about twice to three times what the old cache held for it (1.65 KB against 0.49 KB for the three-operator config), freed with the config object.

**What to change:** nothing.
