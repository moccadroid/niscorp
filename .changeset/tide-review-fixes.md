---
"@niscorp/tide": patch
---

`load` warns about a reflex whose `timeoutMs` is not shorter than `leaseMs`, and still loads it.

A settled run and the run fact that announces it are written in one transaction: a failed write no longer loses the fact, so a reflex that waits on that run still fires.

Facts delayed by `notBefore` no longer keep a due fact from its reflex: the matcher reads only the facts that are due.

The tasks of a reflex that is not loaded are no longer claimed, so they spend no attempt while it is away.
