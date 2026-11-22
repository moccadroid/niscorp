---
"@niscorp/loom": patch
---

BREAKING (pending consolidation): nothing unless a host relied on the form of an object with a key that has a dot in it (`{ "a.b": string }`); its controls showed nothing and wrote `{ a: { b: … } }`.

An object with a key that has a dot in it is edited as JSON. It compiles to the raw JSON box (`loom:raw`) bound where the object stands, so an edit writes the right keys; `createLoomEditor` wraps such a root document as it wraps a non-object root. `toNova` used directly at the root without `rootKey` keeps the old form, as there is nothing to bind the box to: pass `rootKey`.
