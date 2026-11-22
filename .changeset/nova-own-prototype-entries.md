---
"@niscorp/nova": patch
---

BREAKING (pending consolidation): nothing unless an app reads `constructor`, `toString`, `__proto__` or another name every object inherits through a binding (`{{$.x.constructor}}`), which now gives `undefined`.

One rule for names a record inherits: what it inherits from a prototype of its own counts, what every object inherits from `Object.prototype` does not. A `functions`, `endpoints`, phrasebook or reconcilers object made with `Object.create(base)` or as a class instance resolves the names it inherits, as in the last release. A data path no longer reads `Object.prototype`'s members: `$.x.constructor` is `undefined` where it rendered `function Object() { [native code] }`. A getter on a class the data carries still reads, and an endpoint with `fn: 'toString'` still fails as an unknown function.
