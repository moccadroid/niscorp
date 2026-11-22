---
"@niscorp/vex": patch
---

The handler's log line for an unexpected error no longer prints the error object, which under PGlite carries the statement's bound values (the caller's scope among them). It prints the error's code, message and stack, and the SQL text where the driver's error carries it.
