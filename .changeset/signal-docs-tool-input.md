---
"@niscorp/signal": patch
---

DOCS.md says what a tool's `input` schema may be. The model is sent its JSON Schema, taken from the schema's output side, and the arguments are parsed with it once. So an `input` schema validates and does not convert:

- One with no JSON Schema (a `.transform()`, a `z.date()`) rejects the call before any request is made, with Zod's own error rather than a `SignalError`.
- One whose output is another kind than its input (`z.stringbool()`) is described to the model by its output: told `boolean`, a model that sends one gets `input_invalid` back, and it is the string that is accepted.

Convert inside `execute`. DOCS.md says this under "Defining Tools", and a test holds the first. No code changed.

**What to change:** nothing.
