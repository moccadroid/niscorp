---
"@niscorp/solid": patch
---

BREAKING (pending consolidation): nothing unless an app relied on a union field's value being dropped, or a strict stream failing, when the value is of a kind only a later variant takes.

A field of a union (discriminated or not) is now kind-checked against every variant that has it, and passes the finalize check when any of them accepts its value. Before, only the first variant counted: with `w: z.discriminatedUnion('kind', [{ kind: 'text', value: z.string() }, { kind: 'count', value: z.number() }])`, `{"w":{"kind":"count","value":5}}` lost the 5 in `recover` and failed a valid reply in `strict`. A field typed alike in every variant behaves as before.
