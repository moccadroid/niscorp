---
"@niscorp/vex": patch
"@niscorp/nisc": patch
---

The DSL says how `from` joins: along foreign keys, a nullable one as a LEFT JOIN, and never to be restated as a filter. The query agent kept writing the join again as `filter: { eq: [a.key, b.key] }`, which turned the LEFT JOIN into an inner one and silently dropped every row whose key was empty ("what's my name?" came back empty for somebody not yet in a department). Description only; nothing the DSL accepts changed.
