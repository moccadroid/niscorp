---
"@niscorp/cortex": patch
---

The README says what a tool's `input` schema may be. The model is sent its JSON Schema, taken from the schema's output side, and a call's arguments are parsed with it twice: by the loop, then again in front of `execute`. So an `input` schema validates and does not convert:

- One with no JSON Schema (a `.transform()`, a `z.date()`) fails the run before the model is asked, with `code: 'unknown'` and Zod's message.
- One whose output is another kind than its input (`z.stringbool()`) is described to the model by its output and then refuses what its own first parse produced: the tool never runs.
- One that changes a value (`.overwrite()`) changes it twice, while the observation's `args` hold the value as parsed once.

Convert inside `execute`. The README says this under "Errors", and tests hold it. No code changed.

**What to change:** nothing.
