---
"@niscorp/vex": patch
---

A mutation batch can use what an earlier statement wrote: `{ $returned: 'table.column' }`.

A batch ran in one transaction but no statement could see another's result. A row whose id the database generates could not be referenced by the rows written after it in the same batch.

A later statement of a batch can now read a column of the one row an earlier statement wrote:

```ts
[
  { op: 'insert', table: 'orders', values: { note: { $context: 'note' } } },
  { op: 'insertEach', table: 'order_lines', items: { $context: 'lines' },
    values: { order_id: { $returned: 'orders.id' }, sku: { $item: 'sku' } } },
]
```

The reference names the earlier statement — an insert, update, upsert or delete — by the table it writes. It goes in any value position (`values`, `set`, `onConflict.set`, an `upsert`'s `columns` and `insert`), and not in a `where`, a `$lookup`, or an `insertEach`'s `items`. It is for keys: the value passes through the driver, and a timestamp read back that way keeps milliseconds only.

The statement it names must write exactly one row. When it wrote none (its WHERE matched nothing, or the scope boundary kept the row back) or several, the batch fails with `execution_error` and nothing is written. `lintMutation` — so `seedCache` — refuses a reference that no earlier statement can answer, that two earlier statements could answer, that names an `insertEach`, or that names an `insert` whose `onConflict` has no `set`. Scope is unchanged: each statement is scoped on its own, as before.

Every existing entry, request and reply behaves as it did. `MutationValue` gains one union member, `ReturnedRef`.

**What to change:** nothing. To use it, upgrade every process that reads the cache first: a vex older than this one deletes a stored entry whose grammar it does not know, as it does for any form added since it was built.
