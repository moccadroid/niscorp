---
'@niscorp/vex': patch
---

`createShapeMapper` asks the mapping agent for every new query, rows that already have the shape's keys included.

A column can have the shape's key and kind and still not the form the intent asks for: a raw timestamp where the intent asks for `2h ago`, text where it asks for `$1.2M`. The mapper used to hand such rows back unchanged with no model call, so the intent it is now given never reached the agent for them. The cost is one mapping call per new query; a query vex has written replays its stored mapping with no model call, as before. `rowsFitShape` is still exported.

A mapping is run on the rows it was written for before it is used; one that fails there (a path that does not exist) is written again, the agent told why, up to three attempts in all.
