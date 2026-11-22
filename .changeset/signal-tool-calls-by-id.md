---
"@niscorp/signal": patch
---

BREAKING (pending consolidation): nothing unless an app relied on two tool calls a provider streams at one index being merged into one.

A streamed tool call is now told apart by its id as well as its index. When a provider sends a piece with a new id at an index another call already has, it starts a new call instead of being appended to that call: `add {"a":1}` and `mul {"b":2}`, both at index 0, were one call `mul` with the arguments `{"a":1}{"b":2}`, and are now two calls with their own arguments. The new call gets the next index no call has, so `tool_call_delta` events for pieces `a`@0, `b`@0, `c`@1 carry indices 0, 1 and 2. A provider that sends one id per index (OpenAI, Groq, OpenRouter, the Responses adapter) sees no change.
