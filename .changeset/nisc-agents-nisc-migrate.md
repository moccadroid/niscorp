---
"@niscorp/nisc": patch
---

AGENTS.md: `nisc migrate`, where an app deployed with it puts its tables, and where the rows it needs to start are written.

The toolbox row for `cli` names the command. Rule 17 gains two sentences. An app deployed with `nisc migrate` hands its `<app>.app` sequence to moss (`runtime.tables`, with `TIDE_SEQUENCE` when it keeps tide's tables), and the function that opens its runtime migrates and seeds nothing: what it changes itself is changed before the step can check it. And rows an app needs in order to start are written by a migration step, in the same transaction as its tables; a seed that runs at start is for development and demos.

**What to change:** nothing.
