---
"@niscorp/prism": patch
---

BREAKING (pending consolidation): nothing unless an app compares stored fingerprints or `constantsFolded` of a config whose date or locale op has only written inputs, or relies on an IR compiled on one machine answering in that machine's zone when executed on another.

`$date`, `$dateAdd`, `$dateDiff`, `$localeDate`, `$localeMoney` and `$localeNumber` are never worked out ahead of time, by `compile` or by a kept `evaluate`, even when every input is written in the config: they read the machine's clock zone or its `Intl` data. `{"$date":{"value":"2026-01-01T09:00:00Z","format":"HH:mm"}}` compiled in Vienna was stored as `{"$const":"10:00"}` and answered `10:00` from `execute` in Los Angeles, where `evaluate` answered `01:00`; the IR now keeps the op and answers `01:00` there. A `$localeDate` with a written `timeZone` is kept as an op too (it was folded); it answers the same text. On the machine that compiles, every answer is the same. The IR's `fingerprint` and `meta.stats.optimizations.constantsFolded` change for such configs; an IR stored before keeps its folded constant until it is compiled again. `EvalContext` gains an optional `folding` field.
