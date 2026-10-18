---
'@niscorp/vex': patch
---

The engine hands `mapToShape` the request's intent, and `createShapeMapper` gives it to the mapping agent.

`MapToShape` is `(rows, shape, intent?)`: the engine passes the intent a query was asked in, so the mapping can give a value the form the request named (money as `$1.2M`, a date as `Apr 6`). Before, the mapper saw the rows and the shape alone, whose placeholders say nothing of a form. `createShapeMapper` passes it to prism's `mappingAgent` as its `notes`. A mapper that takes two arguments keeps working.
