---
"@niscorp/tide": patch
---

On the Postgres store, a fact payload, an effect input or an output that is a string which is not JSON text (`'hello'`, `'msg_8812'`) reads back as that string. It threw, and stopped `ingest`, every `advance` and the ledger reads that met it. A string that is JSON text reads back as it did.

`load` calls run one at a time, in the order they are made: two that overlapped could finish out of order and load the earlier set, bringing back a reflex the later one had taken out.

An `advance` before the first `load` no longer skips pending runs as "reflex is no longer loaded": fan-out waits for the first load, as matching already did.

`load(reflexes, { at, resume: true })` is a new opt-in for the load a process makes when it starts: a reflex this engine has never loaded keeps its stored watermark, so its `catchUp` decides what the downtime runs and a one-shot clock due during a restart fires after it. Without `resume`, `load` re-baselines as before.
