---
"@niscorp/loom": patch
---

README and DESIGN say what a form guarantees. It gives every field the schema describes a control; it does not validate, so a new document and a document mid-edit can fail the schema: parse it before you keep it. Edits go to the Nova runtime's data, not to the `action.data` that `toNova` returned. A new document starts from each field's empty value (`''`, `0`, `false`, `[]`, the schema's default where it has one, `null` for a kind Loom does not model; a required enum with no default is left out), and `toNova`'s `empty` and `includeOptional` options change that. A self-reference that is not inside an array, and every kind Loom does not model, gets a raw JSON box. No code changed.

**What to change:** nothing.
