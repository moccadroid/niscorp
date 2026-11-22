---
"@niscorp/loom": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host relied on an emptied number box writing `null` for a number whose schema does not take `null`; the key is now absent (a host that saves on change stores it as missing).

Emptying a number box leaves the number absent, so `z.number().optional()` accepts the document; it wrote `{"qty": null}`, which the schema refused. A number whose schema takes `null` (`.nullable()`) still gets `null`. `parse` marks such a field `nullable: true` (a new optional key on `FieldMeta`), `toNova` passes `nullable` and `integer` to `loom:number`, and the kit's number box steps by 1 for an integer and by any amount otherwise.
