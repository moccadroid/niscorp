---
"@niscorp/signal": patch
---

`complete()` and `stream()` on a decision provider say their own name.

Both run through `stepStream`, and the refusal a decision provider gives a chat verb named that instead: `signal.complete('…')` failed with `stepStream() is not available on a decision provider…` and `context.verb: "stepStream"`, for a call the caller never made.

The error now names the verb that was called — `complete() is not available on a decision provider — it answers decide() and generates no text`, `context.verb: "complete"`, and the same for `stream`. `step`, `stepStream` and `embed` already named themselves.

Only those two strings change. The code is `E_VERB_NOT_SUPPORTED` as before, it is raised at the same moment (for `stream()`, when the stream is first read), and no request is sent.

**What to change:** nothing.
