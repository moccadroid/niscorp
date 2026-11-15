---
"@niscorp/loom": patch
---

Renaming a key to a name another entry has (a prism template field, a vex aggregate or compute alias) is refused instead of deleting the other entry; "Add" in the vex aggregate and compute widgets picks a free alias; a vex compute operand can be typed as a decimal ("1." stays on screen).

The prism node chooser lists every prism op under a category, taken from prism's own example groups, so `$fill`, `$has`, `$walk`, the locale ops and others are no longer missing from it.

Two recursive documents in one plugin each render their own nested levels: a recursive template is named after its action (`loom:tree:<action id>:<n>`) instead of `loom:tree:<n>`.

A document with a top-level field named `_errors` keeps that field in the editor: it is no longer stripped, overwritten by the error tree and reported missing.

A stored document whose root is not an object (a list, a scalar, a tuple, a union) opens as it was stored even when its schema refuses it, as an object document already did; validation flags it. It used to open the schema's defaults, which a host saving on change wrote over the stored document.

`<LoomEditor>` calls the `onChange` of its latest render, not the one it mounted with.

A field with two defaults starts at the one zod applies (`.default('a').default('b')` starts at `'b'`), and a discriminated union branch whose discriminator is an enum is tagged with the first value of that enum instead of `undefined`.

`LoomEditorPlugin` is now written as `LoomPlugin` plus `components`, the same shape it had.

A stored document opens on the branch of a discriminated union whose discriminator allows its value, when that discriminator is an enum (`kind: 'box'` for `z.enum(['square', 'box'])`); a tag `Pattern` lists every allowed value in a new optional `values`. The README says a key with a dot in it is not edited correctly, which needs a change in Nova.
