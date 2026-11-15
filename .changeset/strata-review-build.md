---
"@niscorp/strata": patch
---

`prepare` refuses a sequence that is `null` with `INVALID_SEQUENCE`, as it refuses any sequence that does not parse, instead of throwing a `TypeError`.
