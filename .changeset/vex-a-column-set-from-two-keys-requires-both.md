---
'@niscorp/vex': patch
---

An insert requires every key its `values` bind, whatever `onConflict.set` puts in the same column.

An `insert` or `insertEach` may set the same column in `values` and in `onConflict.set`. Vex read the two by column name, so where they put different things in a column it saw only what `onConflict.set` put there. A `$context` key that `values` used for that column, and that nothing else in the statement used, was not in the entry's derived signature and was not required. A call that left it out was not refused. The statement ran with that parameter unbound, and a new row was written with NULL in the column — or, where the column is NOT NULL, the database's own error came back in place of vex's. DOCS.md says a write never executes with holes; now this one does not.

```ts
{ op: 'insert', table: 'people',
  values: { email: { $context: 'email' }, name: { $context: 'name' } },
  onConflict: { target: ['email'], set: { name: { $context: 'newName' } } } }
```

- A call without `name` is refused before any SQL runs: 400 `missing_context`, `Mutation is missing context: name.` (was 200, and a row with `name` NULL).
- Discovery, `collectMutationContext` and the refusal's `details.expected` list both `name` and `newName` (listed `newName` only). `requiredContextKeys` returns both.
- The same where `onConflict.set` puts a literal or a `$lookup` in the column rather than another key, and for the keys a `$lookup` in `values` binds.

An entry that puts different things in one column in the two places has its signature read `values` first, then `onConflict.set`. Its keys can come in another order than before, and a key used in both is listed with the column and type of its place in `values`.

Nothing else moves. An entry whose `values` and `onConflict.set` share no column, or put the same thing in every column they share (the create-or-fetch touch, `set: { email: { $context: 'email' } }`), lists and requires what it did, in the same order. `update`, `delete` and `mutationEffect` are unchanged.

**What to change:** nothing, unless an entry sets a column in `values` from a `$context` key, sets the same column in `onConflict.set` from anything else, and some caller leaves that key out. That call wrote a NULL and is now answered 400. Send the key — `null` to write NULL on purpose; only an absent key is refused — or, if the column was never meant to be set on insert, take it out of `values`.
