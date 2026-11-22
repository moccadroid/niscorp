---
"@niscorp/loom": patch
---

BREAKING (pending consolidation): nothing unless a host relied on a union showing its first branch for a stored value no branch recognises, or reads the `Field` model `parse` exports and relied on a branch's `key` pattern naming an optional key where the branch also has a required unique one.

A union shows the branch the value is, or shows the value as JSON. A stored value whose tag no branch has (`kind: "triangle"`) was labelled with the first branch, and editing wrote that branch's fields into it; with no fallback branch it now chooses none — the chooser shows "—" and the value is shown in the JSON editor until a branch is chosen. A structural union tells its branches apart by a key each requires, before an optional one, so `{ a: "x", t: "y" }` shows the second branch of `z.union([{ a: number, b?: number }, { a: string, note?: string, t: string }])`, not the first. A union of `z.lazy` branches is a union with a chooser, not a raw JSON box.
