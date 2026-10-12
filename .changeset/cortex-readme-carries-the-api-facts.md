---
'@niscorp/cortex': patch
---

The README states thirteen facts about the API that were written only in source comments, and DESIGN.md gives the condition for reading a bare payload.

The README now says what `meta.usage.reported` means, what `repeatedCalls(n)` counts (n + 1 identical calls), that `prepareStep`'s `activeTools` takes tool names, what `transport: 'step'` does, the order hooks and gates run in, who receives `run-start`, that `output-partial` is best-effort, the three kinds of `retry`, what a resumed run keeps, the reason on an approval that timed out, how a hand-written delegating tool nests its child's events, and how `estimatedTokens` is counted.

No behaviour changed.

**What to change:** nothing.
