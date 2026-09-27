---
"@niscorp/cortex": patch
"@niscorp/nisc": patch
---

`repeatedCalls(max)` — a stop condition for a model that keeps sending the same tool call and getting the same answer back (`RunProgress.repeatedCalls`, stop reason `repeated_calls`). A tool called with empty arguments now says so in its `input_invalid` observation, as a call whose arguments arrived as one string already did.
