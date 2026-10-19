---
'@niscorp/vex': minor
---

A shape can declare a field as a Prism expression over the row's stored fields, and `createShapeMapper` maps every flat shape the rows carry with no model call.

`[{ close_date: '', close_date_display: { $date: { value: { $ref: '$.close_date' }, format: 'MMM D' } } }]`: `createQueryDsl` asks for the stored fields a declared field reads, and `createShapeMapper` computes the declared field with Prism, so the stored value beside it is never overwritten. A model-written mapping did overwrite it about a quarter of the time (`close_date: 'Jun 8'`) and left a display field unformatted about a third of the time. `normalizeShape` keeps a declared field whole, so two formats are two cache entries.

A flat shape whose fields the first row carries is mapped by key with no model call. Any other shape — nested, a field the rows lack, a form shown only by example (`'Apr 6'`) — goes to the mapping agent, handed the request's intent and run on the rows before it is used: a mapping that fails there is written again, the agent told why, up to three attempts. The agent is told the rows already answer the request (filtered, sorted, limited) and keeps every row, in order. An intent alone no longer formats a field the rows already carry: declare it, or show the form by example. `rowsFitShape` is still exported.
