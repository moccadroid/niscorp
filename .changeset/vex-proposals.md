---
"@niscorp/vex": patch
---

DESIGN.md's first design decision states the rule without the history of the defect it replaced.

An `exists` inside a `case` inside an aggregate (`sum`, `count`, …) compiles, with the caller's row rules inside it, as it already did inside `compute`. Before, the query was refused with "An `exists` filter was not resolved".
