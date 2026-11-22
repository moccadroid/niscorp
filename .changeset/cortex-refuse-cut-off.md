---
"@niscorp/cortex": patch
---

`output.refuseCutOff: true` on an agent refuses a reply the provider cut off (finish reason `length` or `content_filter`) while its JSON was still open, and an attempt a Groq rejection (`failed_generation`) carried cut short: the run corrects the model as for a reply with no envelope (a `retry` of kind `termination`, or `provider` for a rejection) instead of accepting the reply closed at its last whole value. Without the option nothing changes. It is passed on to signal's `output.refuseCutOff`; a signal without that option ignores it.
