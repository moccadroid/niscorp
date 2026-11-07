---
"create-nisc": patch
---

Every app it makes ships a reviewer: `.claude/agents/nisc-reviewer.md`, a Claude Code agent with read-only tools that follows `node_modules/@niscorp/nisc/REVIEW.md` and reports by rule number. The app's `AGENTS.md` says to run it after each step of the order of work.

The model-first tour now reads data the way an app should: its new packages card replays the vex read `guide/packages` over the app's own `packages` table, whose rows a migration step writes, and the read's Prism `mapping` words each row. The charter grants `packages.read` to `public`, the reads-and-writes card shows that entry, and "Remove the tour" in the app's `AGENTS.md` lists what goes with it.

**What to change:** nothing. An app made before this can copy `.claude/agents/nisc-reviewer.md` from a new one.
