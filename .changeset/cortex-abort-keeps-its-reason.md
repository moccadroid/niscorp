---
"@niscorp/cortex": patch
---

`run.abort(reason)` keeps its reason: it is the `cause` of the aborted result.

`RunHandle.abort` is typed `(reason?: string) => void` and the reason was dropped — it was not on the result, on any event, or anywhere a caller could read it back.

A run stopped by `run.abort('the member closed the tab')` now settles with `error.cause: 'the member closed the tab'`, on `run.result` and on the result the `run-end` event carries. `error.code` (`aborted`) and `error.message` are unchanged, and `run.abort()` with no reason gives the result it always gave, with no `cause`.

The reason is kept beside the run's signal and never put on it: a tool's `ctx.signal` still aborts with an `AbortError`, so a tool — or a `fetch` it started — that tells an abort by that error sees one as before. A run stopped through the caller's own `options.signal` is unchanged too; what that signal was aborted with is not read.

**What to change:** nothing. If you already pass a reason to `run.abort`, the aborted result now carries it as `error.cause`.
