---
"@niscorp/cortex": patch
---

An agent whose `output.schema` takes only strings (`z.string()`, with or without checks such as `.min()`) now gets a `data` that reads as JSON as the model wrote it (`"[1,2,3]"`); before, the run ended `stopped` after its output retries. A schema that also takes any other kind of value is handled as before.

The README says that stop conditions are checked between steps and how to bound a call's time, that under `respond` an answer written as text streams no partials, that a run handle keeps every event until it is dropped, and which wiring errors `run()` throws. DESIGN says how a step with no envelope is corrected. A tool's `name` is described as the name the model calls. The agent-tool timeout default is one constant.
