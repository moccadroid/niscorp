---
'@niscorp/signal': patch
---

A reply missing only its closing brace comes back whole, not as a piece of itself.

The repair ladder tried `extract` before `close-truncated`. On `{"reasoning":"…","data":{"rows":[…]}` — complete but for the last `}` — `extract` found the `rows` array inside it, and any acceptance schema that admits arrays (Cortex's does) took that array as the answer. Cortex then rejected it as not an envelope, and the model was asked again, up to its output-retry limit. The ladder now closes a cut-off reply before it looks for JSON inside it, so the whole object arrives at `wire.rung: 'close-truncated'`.

Only a reply that opens with `{` or `[` and is left unclosed takes a different path. A complete reply, a fenced or prose-wrapped one, and tool-call arguments go through the ladder as before.

**What to change:** nothing.
