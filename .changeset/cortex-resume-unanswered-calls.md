---
"@niscorp/cortex": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: an app that takes `run.snapshot()` while a tool is running (from inside the tool, or from an event before its `tool-end`) and resumes that snapshot now runs that call a second time. Take the snapshot after the call's `tool-end`, or make the tool safe to run twice. Nothing else changes unless an app relied on a call left without an answer never running.

`resumeRun` now first runs the calls of the snapshot's last step that no tool message answers, through their gates, approvals and hooks, before it calls the model. A run aborted between two calls of one step (`c1` answered, `c2` not) left a transcript ending `assistant(c1, c2) tool[c1]`: resumed, it sent that to the provider and `c2` never ran: OpenAI refuses such a transcript, and Groq takes it (200) and the model goes on without `c2`'s result. Now `c2` runs and the model is sent `tool[c1] tool[c2]`. Any call of that step with no tool message runs, so a call that was still running when the snapshot was taken (a `pay` that calls `run.snapshot()` while it executes) runs again on resume. A resume from a pending approval is unchanged, and a fresh `agent.run()` given a transcript that ends in a call runs nothing before the model, as before.
