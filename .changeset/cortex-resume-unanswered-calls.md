---
"@niscorp/cortex": patch
---

BREAKING (pending consolidation): nothing unless an app resumes snapshots of runs aborted between two tool calls of one step and relied on the call left without an answer never running.

`resumeRun` now first runs the calls of the snapshot's last step that no tool message answers, through their gates, approvals and hooks, before it calls the model. A run aborted between two calls of one step (`c1` answered, `c2` not) left a transcript ending `assistant(c1, c2) tool[c1]`: resumed, it sent that to the provider (OpenAI answers it with a 400) and `c2` never ran. Now `c2` runs and the model is sent `tool[c1] tool[c2]`. A resume from a pending approval is unchanged, and a fresh `agent.run()` given a transcript that ends in a call runs nothing before the model, as before.
