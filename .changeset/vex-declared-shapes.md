---
'@niscorp/vex': patch
---

A shape can declare a field as a Prism expression over the row's stored fields, and `createShapeMapper` computes it with no model call.

`[{ close_date: '', close_date_display: { $date: { value: { $ref: '$.close_date' }, format: 'MMM D' } } }]`: `createQueryDsl` asks the query for the stored fields a declared field reads, and `createShapeMapper` computes the declared field with Prism, so the stored value beside it is never overwritten; a mapping a model wrote overwrote it about a quarter of the time. `normalizeShape` keeps a declared field whole, so two formats are two cache entries.

A flat shape whose fields the first row carries, each plain one of the kind its example shows, is mapped with no model call, as rows that fit the shape exactly were; rows with more columns than the shape names are now mapped the same way rather than by the agent. Any other shape — nested, a field the rows lack, a value of another kind — goes to the mapping agent, whose mapping is run on the rows before it is used: one that fails there is written again, the agent told why, up to three attempts in all. The agent is told the rows already answer the request (filtered, sorted, limited) and keeps every row, in order.
