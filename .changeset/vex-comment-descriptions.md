---
'@niscorp/vex': minor
---

Postgres introspection reads a table's and a column's `COMMENT` as the entity's and field's `description` — fields the schema already had and no adapter filled. It is what a query writer needs beside a name ("members" are the people in the room). Descriptions stay out of the schema fingerprint: rewording a comment evicts no query.
