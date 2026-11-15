---
"@niscorp/tide": patch
---

`load` warns about a reflex whose `timeoutMs` is not shorter than `leaseMs`, and still loads it.

A settled run and the run fact that announces it are written in one transaction: a failed write no longer loses the fact, so a reflex that waits on that run still fires.

Facts delayed by `notBefore` no longer keep a due fact from its reflex: the matcher reads only the facts that are due.

The tasks of a reflex that is not loaded are no longer claimed, so they spend no attempt while it is away.

A run whose fan-out fails in a host seam now waits the reflex's `retry.baseMs` (default one minute) before it is tried again, and runs waiting so no longer keep other runs from fanning out. The Postgres store adds a `not_before` column to `tide_run` in a new migration (`nisc.moss.tide/4`).

The Postgres store claims tasks in order whatever the number of `order: 'serial'` reflexes: with as many serial reflexes as the advance's `limit`, other tasks were never claimed. `STORE_CONTRACT` has a check for it, which a host's own store now has to pass as well.
