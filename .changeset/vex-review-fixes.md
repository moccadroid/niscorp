---
"@niscorp/vex": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on a table joined to itself being filtered on one copy only, or on a semantic `$scope` text sent by the client; the server supplies that value, or the request is refused with `missing_scope`.

A table joined to itself now gets its row rules on both copies, a semantic `$scope` text comes from the server, and discovery leaves out entries whose `exists` reads a table the caller cannot read. Tables, subqueries and columns with capitals or reserved names can be read and written, and the query agent's tools accept `null` for an argument the model leaves out.
