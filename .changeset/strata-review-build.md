---
"@niscorp/strata": patch
---

`prepare` refuses a sequence that is `null` with `INVALID_SEQUENCE`, as it refuses any sequence that does not parse, instead of throwing a `TypeError`.

The README says that a line beginning with `--` is left out of a migration's checksum even inside a string literal or a dollar-quoted body, so an edit to such a line is not caught.
