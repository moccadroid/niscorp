---
'@niscorp/tide': minor
'@niscorp/moss': patch
---

A chain's breadth has a ceiling, as its depth does. Every fact records its chain's `root`, and the root counts the facts minted beneath it (`descendants`, incremented atomically at the fact door); one past `maxChainFacts` (default 10,000) is stored parked. Depth alone let a reflex that writes two facts per fact it sees run 2^24 times before anything parked. moss appends migration 2 to `nisc.moss.tide`: two nullable columns on `tide_fact`.
