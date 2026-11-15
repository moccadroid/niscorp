---
"@niscorp/tide": patch
---

On the Postgres store, a fact payload, an effect input or an output that is a string which is not JSON text (`'hello'`, `'msg_8812'`) reads back as that string. It threw, and stopped `ingest`, every `advance` and the ledger reads that met it. A string that is JSON text reads back as it did.
