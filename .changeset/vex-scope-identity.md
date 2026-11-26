---
"@niscorp/vex": patch
"@niscorp/moss": patch
"@niscorp/nisc": patch
---

A mutation's column value may no longer be a `$scope` value naming a key the policy binds (a key a `set` or `match` rule names, such as `userId` or a tenant's id): `owner_id: { $scope: 'userId' }` would stand in for the `set` rule that should write that column. vex refuses such a write with `invalid_dsl` before anything runs, and exports `identityValueMisfits(def, keys)` and `scopeKeysOf(behaviors)` to say which; moss refuses such an entry at boot, publish and refresh (the manifest check `'identity'`), counting `userId` whether or not a rule names it. A `where` may still compare with such a key, and any other `$scope` value (`now`) is written as before. vex DOCS now say plainly what the charter guarantees: who a row belongs to is the charter's in every column a rule names, whatever the entry wrote there, while a column no rule names is the entry's to write, from context too, so a column that records an owner or a tenant must be named by a `set` rule. moss DOCS list the check; nisc's AGENTS.md says both.
