---
"@niscorp/tide": patch
---

`load` warns about a reflex whose `timeoutMs` is not shorter than `leaseMs`, and still loads it.

A settled run is marked announced in the same transaction as the run fact that announces it, one run at a time: a failed write no longer loses the fact, the run is announced on a later advance, and the runs after it are announced meanwhile.

Facts delayed by `notBefore` no longer keep a due fact from its reflex: the matcher reads only the facts that are due.

The tasks of a reflex that is not loaded are no longer claimed, so they spend no attempt while it is away.

`ledger.facts({ reflexId })` reads only that reflex's facts instead of the whole fact table. The docs describe what `sweep` removes and drop the history they carried.

The Postgres store no longer sets aside room in a claim for every `order: 'serial'` reflex before it knows whether one has work: with as many serial reflexes as the advance's `limit`, other tasks were never claimed. Serial reflexes are still claimed first.
