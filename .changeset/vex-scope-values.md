---
"@niscorp/vex": minor
"@niscorp/nisc": patch
---

A mutation's column value may now be `{ $scope: "key" }`, as a filter's value already could: an entry stamps the server's moment with `archived_at: { $scope: 'now' }`, from a `now` the host puts in scope per request (under moss, the app's `scope` seam), instead of a time the client sends in context or a function written only to stamp it. Every statement of a batch binds the same value; a host that supplies none gets `missing_scope` and nothing is written. The policy still wins: the columns a `set` or `match` rule names are written after the parse, over anything the entry wrote. A constant `$context` or `$scope` value written into a `json` column of an `insertEach` now binds as JSON text, as it does in an `insert`; before, node-postgres sent an array as a Postgres array literal and the column refused it. vex DOCS has a new "The server's time" section; nisc's AGENTS.md says to stamp a write's moment this way.
