---
"@niscorp/solid": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: a strict stream given a non-string for a string-format field (`z.email()`, `z.url()`, `z.uuid()`, `z.iso.*`) now fails, where it resolved; nothing else unless an app relied on what is inside a field that takes any value being dropped.

What is inside a field whose schema takes any value is now kept, as DESIGN and README say. In `recover` and `strict`, everything below `z.any()`, `z.unknown()` or an intersection was refused as `<unknown path>`: `x: z.any()` given `{"x":{"b":[1,2]}}` ended `{ x: {} }` with an error. The fields of a `z.lazy()` or a pipe are now checked against the schema it stands for (the lazy's schema, the pipe's input side), so a recursive schema keeps every level instead of nothing.

A string-format field (`z.email()`, `z.url()`, `z.uuid()`, `z.iso.*`) is now kind-checked as a string, as `z.string()` is: `{"to":[1]}` for `to: z.email()` was taken in as a list. In `recover` such a value is skipped with an error; in `strict` it fails the stream.
