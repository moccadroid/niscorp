---
'@niscorp/vex': patch
---

Under `require`, an engine error on a read keeps its HTTP status.

The CommonJS build gives each entry point its own copy of `VexError`, and the HTTP handler recognised an engine's error by `instanceof`. With the engine from `require('@niscorp/vex')` and the endpoint from `require('@niscorp/vex/hono')` or `require('@niscorp/vex/express')`, every error the engine threw on a read was therefore answered as an unexpected one: 500, without its `details`, and with a `[vex] unhandled error` line in the log. The ESM build has one copy of the class and answered as DOCS.md says. Now both do:

- an unknown fingerprint is 404 `cache_miss` (was 500);
- a protected entry asked to change is 409 `fingerprint_protected` (was 500);
- `locked`, `agent_failed`, `unsatisfiable`, `scope_denied`, `invalid_dsl` and an `execution_error` thrown by the engine are 400, with `details` where the error has them (were 500, without);
- `missing_scope` is still 500, and its reply no longer names the scope keys the host left out — they go to the log, as they always did under ESM.

The same was true of an app that loads vex in both formats at once, and of moss loaded with `require` (its `/api/…/vex` endpoints). Writes were never affected: the handler runs them itself.

The engine has the same check for a generation hook's `unsatisfiable`. With the hook from `require('@niscorp/vex/agent')` it never matched, so nothing was negative-cached and the model was asked again on every repeat of a request it had already called impossible. The refusal is cached now, for `unsatisfiableTtlMs` (five minutes unless set), as it is under ESM.

Vex now recognises its own errors by a mark every copy of the class carries. Nothing is added to the exports, and nothing an error prints or serializes changes. An app's own `err instanceof VexError` is as it was: it holds for an error the engine throws, and under `require` it still does not hold for one made in `@niscorp/vex/agent` — read `err.code` there (DOCS.md, "Error handling").

**What to change:** nothing in an ESM app, and nothing in a CommonJS app that calls `handleQuery` from `@niscorp/vex` itself. A CommonJS app that had come to depend on those 500s now sees the documented status: a client that reads 500 as "unknown fingerprint", a retry or an alert on 5xx, a log search for `[vex] unhandled error`.
