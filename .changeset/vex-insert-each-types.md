---
'@niscorp/vex': patch
---

`insertEach` converts each `{ $item }` value by its column's own type, as Postgres converts an `insert`'s value. It cast through a fixed list of five types before, so Postgres refused every other column type (`column is of type … but expression is of type text`).

- **Columns it now writes:** `time`, enums, `inet`, `interval`, arrays (an item is a JSON array) and pgvector `vector`, also when the extension lives in another schema. A vector item is a JSON array of numbers (`[0.1, 0.2]`) or the pgvector text form (`"[0.1,0.2]"`), so a list of embeddings goes in one statement.
- **A `timestamp` (without time zone) is stored as `insert` stores it.** It was read as `timestamptz`, so with the session's time zone at Europe/Vienna, `2026-10-26T09:30:00Z` landed as 10:30; it now lands as 09:30.
- **A fraction for an integer column is refused, as `insert` refuses it.** It was rounded: 7.5 stored 8.

**What to change:** an app that sends fractions to an integer column through `insertEach` rounds them itself. An app whose database sessions are not on UTC and that wrote a zoned value into a `timestamp` column through `insertEach` has shifted rows from before; new rows are not shifted.
