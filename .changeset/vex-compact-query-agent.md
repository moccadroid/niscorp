---
'@niscorp/vex': patch
---

`createQueryDsl` hands the query agent the schema and the DSL spec as compact text instead of JSON: an entity per line with its relations and indexes, and the DSL as types that keep every description, property and allowed value. On a 15-entity CRM schema the fixed part of each call drops from about 36,000 characters to about 13,000. On 19 queries a screen builder asked for, the agent answered all 19, with the same row counts as before, at 44% of the cost and a median of 3.5 s per query instead of 5.1 s. The query it writes is still validated against the full DSL schema.
