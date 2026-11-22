---
"@niscorp/loom": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host relied on a newly chosen Prism op in the editor getting its optional arguments filled in, on `includeOptional: false` or `empty` being ignored inside union branches, or on the exact `loom:field` node of an optional field (it now has a `model` and an `optional: true` prop; a host kit that registers its own `loom:field` gets them and can ignore them).

An optional field can be removed. Its `loom:field` wrapper is bound to the field's value and carries `optional: true`, and the kit's `LoomField` shows a Remove link beside the label while the field has a value; Remove writes the field back to absent, so `.optional()` accepts the document. The controls show as before, and typing into them adds the field again. `toNova`'s `includeOptional` and `empty` now apply inside union branches as well (`{ shape: { kind: "a" } }` with `includeOptional: false`, where it was `{ kind: "a", note: "" }`). In the Prism plugin a newly chosen op starts with its required arguments only — `$localeMoney`, `$localeDate` and `$round` start as `{}`, `$sortBy` as `{ as: "" }` — where it got `minorUnits: false, digits: 0`, `hour12: false, timeZone: ""` and the like, which changed what the op did; an optional argument that has a value shows a Remove link.
