---
"@niscorp/nova": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on a field with `model: '{{…}}'`, or inside a loop with `for: '{{…}}'`, writing nothing when typed into.

A `model` written as a single template (`model: '{{$.q}}'`) binds like the bare path, and a loop whose `for` is a single template (`for: '{{$.lines}}'`) keeps the bindings of the `model`s inside it: such fields write what is typed, and their render nodes carry `model` and `value`, where they bound nothing.
