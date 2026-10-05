---
"@niscorp/solid": patch
---

`destroy()` no longer raises an unhandled rejection when nobody holds `final()`.

A stream's `final()` promise exists from the start, and `destroy()` rejects it. A stream read through `on` / `onFinal` / `onError` alone never takes that promise, so nothing could catch the rejection: in Node the process ended with `Error: [solid] stream destroyed`, exit code 1, and a browser logged an uncaught error. Every selection made with `select()` rejected a promise of its own the same way.

Both rejections are now caught where they are raised, as a strict failure's already was. A caller that holds `final()` — taken before or after `destroy()` — still sees it reject with `[solid] stream destroyed`.

**What to change:** nothing. A `stream.final().catch(() => {})` written only to keep `destroy()` quiet can go.
