---
'@niscorp/prism': patch
---

A `$const` is returned as it is written, also where its data has a key named like a sugar op.

Before a config runs, the sugar ops (`$sum`, `$avg`, `$count`, `$min`, `$max`, `$pluck`, `$take`, `$drop`, `$match`, `$flatMap`) are rewritten to core ops. That pass walked every object, so it also rewrote what is not a node:

```ts
{ $const: { total: { $sum: 1 } } }
// answered { total: { $reduce: { … } } }, from evaluate, execute and prismTransform alike

{ $with: { let: { $sum: [1, 2] }, value: { $var: '$sum' } } }
// "Variable not found: __acc" — the binding called $sum was rewritten as a sum

{ $renameKeys: { from: { $ref: '$' }, map: { $count: 'n' } } }   // over { $count: 1 }
// { $count: 1 } — not renamed
```

A `$const`'s data, the names of a `$with`'s bindings and a `$renameKeys` map are now left alone; the three answer `{ total: { $sum: 1 } }`, `[1, 2]` and `{ n: 1 }`. Data that holds MongoDB-style operators, or a Prism config kept as data (as a strata migration writes one into a document), comes back as it was written.

A config with none of these compiles to the core and fingerprint it had. One that has them compiles differently, so its fingerprint changes.

**What to change:** nothing. An IR compiled earlier from such a config keeps its wrong constant until it is compiled again.
