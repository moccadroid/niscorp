---
'@niscorp/vex': patch
---

An upsert's signature lists the key its `columns` bind, also for a column its `insert` sets too.

An `upsert` may set the same column in `columns` and in `insert`: the first is written when it updates, the second when it creates. Its derived signature read the two merged by column name, so where they used different `$context` keys only the one in `insert` was listed. The key the update binds was missing from discovery and from `collectMutationContext` — and from `details.expected` of the very `missing_context` refusal that named it. What an upsert requires was right all along, on both branches; only the listing was short.

```ts
{ op: 'upsert', table: 'people', key: 'id',
  columns: { name: { $context: 'name' } },
  insert: { name: { $context: 'firstName' } } }
```

- The signature lists `name` beside `firstName` (listed `firstName` only). `firstName` is still marked `insert only`.
- Where both halves use the same key for the column, that key is no longer marked `insert only`: the update binds it too.

Nothing else moves. An upsert whose `columns` and `insert` share no column is listed as it was, and no write runs, is refused or lands differently. Inside, the signature, the required keys and the `$returned` check now read what a statement sets through one function.

**What to change:** nothing.
