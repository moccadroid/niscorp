---
"@niscorp/tide": patch
---

On the Postgres store, a fact payload, an effect input or an output that is a string which is not JSON text (`'hello'`, `'msg_8812'`) reads back as that string. It threw, and stopped `ingest`, every `advance` and the ledger reads that met it. A string that is JSON text reads back as it did.

`load` calls run one at a time, in the order they are made: two that overlapped could finish out of order and load the earlier set, bringing back a reflex the later one had taken out.

An `advance` before the first `load` no longer skips pending runs as "reflex is no longer loaded": fan-out waits until the engine's first load has finished. After it, a run whose reflex a load left out is skipped as before.

`load(reflexes, { at, resume: true })` is a new opt-in for the load a process makes when it starts: a reflex this engine has never loaded keeps its stored watermark, so its `catchUp` decides what the downtime runs and a one-shot clock due during a restart fires after it. Without `resume`, `load` re-baselines as before.

`advance` takes an optional `clock`, and the driver passes its own `now`. Given one, each task's lease starts again just before its effect, never to end before the claim's, and the effect runs only if the task is still this claim's: a task late in a slow pass, whose lease had run out and which another instance had claimed again, no longer runs twice. That is one more write per task. Without `clock`, nothing changes.

`load` warns about a one-shot clock whose date does not exist (`2026-02-30`), naming the day it fires on (2026-03-02). The reflex loads and fires as before.

The docs say that a `dedupeKey` is unique across the whole ledger and not per identity, that `duplicate_unit` is never thrown to a caller, that a spring-forward time shifts by the length of the gap, and what `sweep`'s `tasks` horizon removes.
