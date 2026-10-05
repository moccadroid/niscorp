---
"@niscorp/strata": patch
---

`compareSnapshot` reads a tuple by position: swapped positions are a change.

Every array in a schema was compared as a set — right for a union's members, a `required` list, an `enum` — and that included a tuple's `prefixItems`, where position is the grammar. `z.tuple([z.string(), z.number()])` changed to `z.tuple([z.number(), z.string()])` read as `{ status: 'same' }` while a document valid before (`["a", 1]`) was no longer valid, so the gate asked for no migration.

A tuple's positions are now compared place by place: the swap above is `changed`, with `~ …prefixItems[0].type: "string" → "number"`, and a position added or removed is named (`+ …prefixItems[1]`). What sits inside a position is compared as before, a union there still as a set. A recorded snapshot is read as it was and none needs re-recording: nisc's own grammars, Prism's with its ten tuples among them, answer `same` as before.

**What to change:** nothing, unless a grammar of yours had a tuple's positions reordered at a version that was already recorded. That was a change the gate missed; it now says so, and the answer is the migration the change owed — append it, then record the new version.
