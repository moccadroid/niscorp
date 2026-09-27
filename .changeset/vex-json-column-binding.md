---
'@niscorp/vex': patch
---

A value written into a json/jsonb column binds as its JSON text. Left to the `pg` driver, a JS array became a postgres ARRAY literal — `[]` arrived as `'{}'`, an empty jsonb OBJECT, and a non-empty one did not parse at all. PGlite binds arrays as JSON, so nothing on PGlite showed it. Inserts, updates and upsert conflict sets; `insertEach` already did this for its items.
