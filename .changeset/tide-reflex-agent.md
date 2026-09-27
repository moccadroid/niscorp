---
"@niscorp/tide": patch
"@niscorp/nisc": patch
---

`@niscorp/tide/agent`: `createReflexAgent({ effects })`, a cortex agent that writes one reflex — tide's own schema — from what somebody wants automated, the local `now` and timezone, and the effects the host offers. A reflex naming an effect that is not offered, or an input that effect's schema refuses, is corrected in the run (`effectProblem`). Cortex is an optional peer used only by this subpath; the engine still imports nothing but zod. Measured in lyceum on gpt-oss-120b at `low`, given the deck as facts and with a way to refuse added per run: 13/16 on probes written before the run — slides named by title, requests no effect can do (refused), a request with no time; ~1 s and ~2.3k tokens each.
