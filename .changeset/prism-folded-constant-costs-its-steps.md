---
"@niscorp/prism": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a config near its `maxSteps` limit relied on passing from the second call; it is now refused on every call, as its first call already was.

A part of a config that `evaluate` works out ahead of time from the second call (when the config object is kept and its tree prepared) spends the steps working it out took, each time it is evaluated. A `$join` of 600 written parts under `maxSteps: 500` was refused on the first call and passed from the second; it is now refused on every call. `compile` and `execute` are unchanged: a compiled IR counts such a part as one step.
