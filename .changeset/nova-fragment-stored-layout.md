---
"@niscorp/nova": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on a fragment's slot showing the stored-layout id of the action it wraps as text.

A fragment around an action whose `layout` is a stored-layout id (`layout: 'invoice-body'`) renders the stored layout in its `{ slot: 'body' }`, where it rendered the id as text: `composeAction` fills the slot with `{ ref: 'invoice-body' }`, which the renderer resolves from the layout store. A fragment whose own layout is an id still replaces the layout composed so far. The fragment `layout` description says so.
