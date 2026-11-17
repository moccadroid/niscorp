# Vex: upgraded columns

Status: built on branch `worktree-vex-upgraded-reads` (2026-11-17), reviewed twice (once independently, once against
nisc's package rules), with the findings fixed. Not committed, not released. The rules, as an app author meets them,
are in `packages/vex/DOCS.md`, "Upgraded columns". This file keeps the why.

## The problem

Some JSON columns hold values written at an older grammar, with the stamp each was written at in a sibling column.
Rule 19 says such a value is upgraded where it is read.

A vex read could not do that. The engine handed the raw rows to the entry's Prism `mapping`, and nothing between the
two knew about grammars. So an app that keeps stamped JSON read it through a server function: replay the entry,
upgrade each value, shape the result in TypeScript. The case that raised this was an app (Mira) whose reactive read of
such a table was blocked by this and nothing else in vex.

## The shape

The engine is told once which columns are upgraded, keyed by table and column the way `behaviors` is, and it is
handed strata's upgrader:

```ts
createQueryEngine({
  adapter,
  upgrader,   // createUpgrader(grammars, { transform: evaluate }); vex uses upgrade, locate and stamp
  upgradedColumns: {
    answers: { plan: { stamp: 'grammar', kind: 'acme.answers/plan', unreadable: 'omit' } },
    notes: { body: { stamp: 'grammar', kind: { grammar: 'acme.notes', column: 'kind' } } },
  },
});
```

Under moss the app writes the same object on the manifest, `defineApp({ upgradedColumns })`. Moss parses it with vex's
own `UpgradedColumnsSchema` and hands it, together with the upgrader it already builds, to the app's engine and to the
engine that answers intents.

## How it works

- **One decision, in one place.** `runPipeline` is what every query passes through: a replay, `compile`, `test`, and
  the generator's test runs. It returns, beside the compiled SQL, the list of upgrades the read needs
  (`columnUpgrades`). Every path that returns rows applies that list (`upgradeRows`) before anything else sees the
  rows: the replay and generated-read path, the reactive path for every caller and every refetch, `engine.test`, and
  the generator's test runs.
- **An allow-list, not a list of forms to refuse.** Outside filters and sorts, an upgraded column may be named only as
  one of the outer read's own fields. Anything else (a subquery's fields or computes, a compute, an aggregate, a
  groupBy, or a DSL form added later) is refused, because the value would arrive un-upgraded. The first version
  listed the forms to refuse instead, and both reviews found forms it had missed (a subquery's compute; a compute
  named like the stamp). That is why it was turned around.
- **The stamp is parsed, not coerced.** It must be null, or an object of grammar names to whole numbers. Anything else
  counts as a value that does not upgrade.
- **`unreadable` per column.** A value that does not upgrade refuses the whole read (`'refuse'`, the default), leaves
  its row out (`'omit'`), or is set to null (`'null'`). The last two are said in `meta.warnings`. The default follows
  rule 19. The other two exist because an app may rather show the other rows than none.
- **Checked at start.** `createQueryEngine` checks that the setting parses, that an upgrader is there, and that every
  kind is one the upgrader's grammars declare. `introspect()` checks that the columns exist and that the value and
  stamp columns are JSON.
- **Seeded reads checked at boot, under moss.** Vex checks a read when it compiles it, which for a seeded entry is its
  first replay: the app would boot and the first person to open the read would get the error. So moss compiles every
  seeded read at boot, and every one a refresh hands over, where the app names `upgradedColumns`. Only there: doing
  it for every app would refuse boots that work today, for seeded reads that were never replayed.
- **Only the app's own tables, under moss.** A feature's own entries, the artifactory's and the generation pointer's
  run on a third engine, which upgrades nothing. The app does not author those tables' contents, so moss refuses a
  boot whose `upgradedColumns` name one, rather than upgrade some of their reads and not others.

## Why it breaks nothing

- An engine or app that names no `upgradedColumns` computes an empty list. `upgradeRows` then hands back the same
  array, and the reactive dedup compares `[result, []]`, which is equal exactly when the result is equal.
- No entry, fingerprint, Prism IR, cache entry, cache table, grammar or error code changes. So no app has to run
  `strata upgrade` or `nisc migrate`.
- Every new field is optional. The new exports are additive: `UpgradedColumnsSchema`, `UNREADABLE_MODES`, and the
  types `UpgradedColumn`, `UpgradedColumns` and `ColumnUpgrader`.
- Strata was already a required peer of vex, imported at run time. Moss adds a manifest field and no export.

Both reviews checked this point and found no difference for an app that does not use the setting.

## Alternatives rejected

- **A field on each read entry.** It changes the `nisc.vex/entry` grammar, which needs a marker, and every app would
  then have to run `strata upgrade`. It also has to be repeated on every read of the column, and the read that forgets
  it returns stale values without an error.
- **A Prism operator `$upgrade` in the mapping.** It changes Prism's grammar. Prism would need an upgrader everywhere
  it runs, and every mapping would have to call it.
- **A generic rows hook on the engine.** It is the same size, but it does not say what it does.
- **Rewriting stored values at deploy.** It locks the table. Rows written by a process still running the old code stay
  old. And rule 19 asks for the upgrade at the read.

## Limits

- The kind column must be in the same table as the upgraded column. A kind taken from a joined table would need
  `column: 'table.column'`, which is an additive later step.
- A write's returned rows are as stored.
- With `'omit'`, a read whose shape is an object answers the first row that is left. The docs say to use `'null'` or
  `'refuse'` where that would mislead.
- The generator's own tools that aggregate over a column (`describeField`'s distinct count) are refused on an
  upgraded column, like any read. The generator sees that refusal as the tool's answer.
