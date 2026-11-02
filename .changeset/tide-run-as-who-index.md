---
'@niscorp/tide': patch
---

The Postgres store indexes `tide_run.as_who`. A host scopes its reads of the run ledger on that column, so every one of those reads filters on it; vex flagged the filter as unindexed. It is a new migration, the third of `TIDE_SEQUENCE` (`CREATE INDEX IF NOT EXISTS tide_run_as_who ON tide_run (as_who)`), applied where the store migrates its tables.
