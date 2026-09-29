---
'@niscorp/strata': patch
'@niscorp/prism': patch
'@niscorp/vex': patch
'@niscorp/nova': patch
'@niscorp/moss': patch
---

A document nested deeper than 256 levels is refused before a schema reads it. The grammars are recursive and so are their schemas: a layout, a Prism config or a Vex filter a few thousand levels deep threw RangeError from inside `safeParse` instead of coming back refused. strata exports `DOCUMENT_DEPTH_LIMIT`, `exceedsDepth` (iterative) and `depthRefusal`; nova's definition and layout validation, Prism's compile/evaluate/validate, Vex's request handler, engine, query tool and cache-entry validation, and moss's integration intake ask it first.
