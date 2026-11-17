---
"@niscorp/vex": patch
"@niscorp/moss": patch
"@niscorp/nisc": patch
---

**A vex read returns stamped JSON columns upgraded.** A JSON column whose values carry the grammar stamp they were written at in another JSON column of the row can now be named once on the engine, with a strata upgrader beside it: `createQueryEngine({ upgrader: await createUpgrader(grammars, { transform: evaluate }), upgradedColumns: { answers: { plan: { stamp: 'grammar', kind: 'acme.answers/plan' } } } })`. A kind can also be read from the row: `kind: { grammar: 'acme.notes', column: 'kind' }`. Every read that returns the column (a replay, a generated read, a reactive read's every answer, `engine.test`) hands its mapping and its caller the value upgraded, with the stamp set to the stamp the upgrade gives back. A read returns the column only as one of its own fields, with its stamp (and kind) column beside it; vex refuses any other read of it when the read is compiled. A row that does not upgrade refuses the read, or, where the column says `unreadable: 'omit'` or `'null'`, is left out or has that value set to null, with a line in `meta.warnings`. New exports: `UpgradedColumnsSchema`, `UNREADABLE_MODES`, and the types `UpgradedColumn`, `UpgradedColumns`, `ColumnUpgrader`.

**Moss takes them on the manifest.** `defineApp({ upgradedColumns })` hands them to the app's engine and to the one that answers intents, with the upgrader moss builds from nova's, Prism's and vex's grammars and the app's `grammars`. Only the app's own tables can be named. The boot is refused where a table named is a feature's, the artifactory's or the generation pointer's (their owners read them as stored), where a kind is in none of those grammars, where a column or its stamp is not a json column of the database, or where a seeded read does not compile: an app that names `upgradedColumns` has every seeded read compiled at boot and on a refresh, so a read of an upgraded column that vex refuses stops the boot rather than its first replay.

**The rulebook** says so under "Using Vex" and in rule 19.

**What to change:** nothing. An app or engine that names no `upgradedColumns` reads every column as stored, as before. No grammar, table, entry or cache format changes.
