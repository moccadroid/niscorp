---
"@niscorp/solid": patch
---

BREAKING (pending consolidation): nothing unless an app relied on a union field's value being dropped, or a strict stream failing, when the value is of a kind only a later variant takes.

A field of a union (discriminated or not) is now kind-checked against every variant that has it, and passes the finalize check when any of them accepts its value. Before, only the first variant counted: with `w: z.discriminatedUnion('kind', [{ kind: 'text', value: z.string() }, { kind: 'count', value: z.number() }])`, `{"w":{"kind":"count","value":5}}` lost the 5 in `recover` and failed a valid reply in `strict`. A field typed alike in every variant behaves as before.

So that a field cannot take one variant's kind under another variant's discriminator, an object or list a union decides is checked when it closes: it must fit one variant by the kinds of its fields and the values of its literal and enum fields. `{"w":{"kind":"text","value":5}}`, or `{"a":1,"b":"x"}` against the union of `{ a: string, b: string }` and `{ a: number, c: number }`, fails a strict stream, as it did, and in `recover` is reported with `onError` (`expected: 'a variant of the union'`) while the value stays in `current()`; before, `recover` dropped the field's value silently.
