---
"@niscorp/vex": patch
---

BREAKING (pending consolidation): nothing unless a client branches on the 500 (or its SQLSTATE code, such as `22P02`) that a read answered when the client's own context value did not fit its column; that is now a 400 `invalid_request`.

A read whose context value does not fit the column it is bound to (`{ ids: 't1' }` on an `in` list, `{ min: 'abc' }` on an integer) now fails with `invalid_request` naming the key, `details: { key, code }`, which the handler answers with 400. It applies only when Postgres's error names a bound parameter that is one of the statement's context values; division by zero, numeric overflow, a bad stored value and a wrongly typed scope value stay 500. The handler's log line for an unexpected error now carries its code, message, SQL text and stack, never the error object with the statement's bound values.
