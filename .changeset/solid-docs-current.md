---
"@niscorp/solid": patch
---

README and DESIGN say what `current()` holds. Outside `trust` mode, and where the schema states a value's JSON kind, a value of another kind is not written into it. An object the reply creates (a list row, an object where the initial value has `null` or nothing, a record entry) starts empty and fills in key by key, so it can lack required keys until it closes, with no error. `constraints: 'finalize'` reports a violation and leaves the value in place; in `strict` the stream fails with that value in it. What is written should be the JSON alone: a code fence around it is ignored, a `"`, a bracket or a brace in text before it is not. No code changed.

**What to change:** nothing.
