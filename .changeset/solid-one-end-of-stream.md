---
"@niscorp/solid": patch
---

BREAKING (pending consolidation): nothing unless an app relied on a selection's `final()` resolving with the frozen value after a strict failure, or on a root key `""` ending the stream at its object's close.

A stream now ends once:

- After a strict failure, a selection's `final()` that had not resolved rejects with `[solid] stream failed validation`, as the root's does: `select('items').final()` awaited before the failure never settled, and `select('count').final()` asked after it resolved with the starting value. A selection that resolved before the failure keeps its value.
- A `final()` that resolved keeps its value: text after the root that fails a strict stream no longer makes a later `final()` reject.
- A root key `""` whose value is an object no longer ends the stream at that object's `}`: `{"":{"x":1},"b":2}` resolves `final()` at the last `}`, with `b` in it, and a key beside it finalizes with its value.
