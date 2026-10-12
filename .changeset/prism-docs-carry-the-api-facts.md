---
'@niscorp/prism': patch
---

DOCS.md and the README state seven facts about the API that were written only in source comments.

DOCS.md: a negative index in a `$ref` path is refused, the generated JSON Schema does not carry the `$ref` path rule, and `maxValues` counts a value each time it appears. README: an example's `id` is unique and in kebab-case, an example of several operators has no `op`, which ops `MAPPING_OPS` leaves out, and that the mapping agent's `data` is the config itself.

No behaviour changed.

**What to change:** nothing.
