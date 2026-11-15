---
"@niscorp/strata": patch
---

`prepare` refuses a sequence that is `null` with `INVALID_SEQUENCE`, as it refuses any sequence that does not parse, instead of throwing a `TypeError`.

The README says that a line beginning with `--` is left out of a migration's checksum even inside a string literal or a dollar-quoted body, so an edit to such a line is not caught.

The README lists what `INVALID_SEQUENCE` is raised for, and where.

The README says that a statement Postgres will not run inside a transaction, such as `CREATE INDEX CONCURRENTLY`, always fails its run with `STEP_FAILED`.
