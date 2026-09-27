---
"@niscorp/tide": patch
"@niscorp/nisc": patch
---

Every fact the ledger admits is announced, and so is every refusal. A fact a handler emits through `ctx.emit` now fires `fact.ingested` — before, it landed in the ledger and never reached `onEvent`, so a watcher saw the next run start on a fact nobody had announced. It is announced only after the attempt's transaction commits. A fact refused on its `dedupeKey`, on any path, now fires the new `fact.deduped` event instead of nothing. `ingest` still answers `undefined` on a collision and the store contract is unchanged; a consumer that switches exhaustively over `TideEvent` gains one case to handle.
