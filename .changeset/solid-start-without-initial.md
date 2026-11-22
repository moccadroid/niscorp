---
"@niscorp/solid": patch
---

BREAKING (pending consolidation): nothing unless an app relied on `createStream` throwing for such a schema, or on a cortex agent with such a data schema emitting no `output-partial` events.

`createStream` without `initial` no longer throws for a schema whose derived starting value only fails a constraint: `.min(1)`, `.positive()`, `array().min(1)`, an email, url or uuid format, a `z.record` or a `z.lazy`. The derived value is used when every value in it is of a kind the schema takes at its place; constraints are checked when a field finishes, as for every streamed value. A starting value that is no object or list (`z.any()`, a `.nullable()` object) no longer makes `write('{…')` throw a `TypeError`: the reply's root is kind-checked and becomes the value.

Through cortex, which makes its partial-output stream without `initial`, an agent whose data schema has such a field or is recursive now emits `output-partial` events, where it emitted none.
