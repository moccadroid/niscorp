---
"@niscorp/vex": patch
"@niscorp/nisc": patch
---

The query agent works on models that take a tool's parameter schema as the whole contract. `testQuery` declares every top-level key of the DSL (shallow — what goes inside each stays the spec's) instead of an empty object: qwen 3.8 27b sent `{}` to the old one until its step limit, and at reasoning `none` now answers 10 of 12 test questions where it answered none. A passing test tells the model to finish, the DSL spec is headed as the OUTPUT SCHEMA the finish protocol names, and the agent stops after three identical calls (`repeatedCalls(2)`). `createShapeMapper` returns the identity with no model call when the rows already are a flat shape (`rowsFitShape`), and the query agent aliases a flat shape's single-column keys so they are.
