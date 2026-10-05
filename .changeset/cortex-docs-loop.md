---
"@niscorp/cortex": patch
---

README and DESIGN describe the loop as it runs. A turn of prose with no envelope in it is corrected without counting against `outputRetries`, so `stepCount` is what ends a model that keeps writing prose, and a `stopWhen` you pass replaces the defaults; `outputRetries(n)` means n attempts and n − 1 corrections. An invalid answer gets the attempt and a system message appended, not a tool error. A `respond` sent beside other tool calls is dropped, and output streamed by a step that ends in tool calls is not the answer. Through Signal a call to a tool the agent does not have is read as an attempted answer, so `tool-end` kind `unknown-tool` is rare. `policy.tools` lists take tool ids, not the names the model calls. A tool's `output` schema types what `execute` returns and is not applied at runtime. No code changed.

**What to change:** nothing for this release. A `policy.tools` entry written with a tool's name, where its `id` differs, has never matched: write the id.
