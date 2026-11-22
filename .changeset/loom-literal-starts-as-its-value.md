---
"@niscorp/loom": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host relied on a `z.literal` field compiling to a raw JSON box that starts at `null`, or reads the `Field` model `parse` exports (a literal is now `{ kind: "enum", options, default }`, where it was `{ kind: "unknown" }`).

A `z.literal` field is a select of its value (or values) and starts at the first. A plain `z.union` of literal-tagged objects used to start with `{ kind: null, radius: 0 }`, which no branch accepts; it now starts with `{ kind: "circle", radius: 0 }`.
