---
'@niscorp/prism': patch
---

`compile` no longer reads a `$with` binding or a `$renameKeys` key that is named like an op as that op.

A `$with` binding and a `$renameKeys` map are keyed by names, and a name may start with `$`. The optimizer walked those records as nodes, so where a name was an op's, `execute` did not answer as `evaluate` does:

```ts
{ $with: { let: { $upper: 'x' }, value: { $var: '$upper' } } }
// evaluate: 'x'. execute: "Variable not found: $upper" — the binding had been folded to { $const: 'X' }.

{ $with: { let: { $ref: 2 }, value: { $var: '$ref' } } }
// evaluate: 2. compile threw TypeError: path.startsWith is not a function.

{ $renameKeys: { from: { $ref: '$' }, map: { $upper: 'x' } } }   // over { $upper: 1 }
// evaluate: { x: 1 }. execute: { $upper: 1 } — the key was not renamed.
```

`execute` now answers all three as `evaluate` does, from a fresh IR and from one read back from storage. A config with no such name compiles to the same core and the same fingerprint as before. One with such a name compiles to a different core, so its fingerprint changes.

**What to change:** nothing. An IR compiled earlier from such a config and stored keeps its wrong answer until it is compiled again.
