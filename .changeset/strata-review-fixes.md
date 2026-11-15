---
"@niscorp/strata": patch
---

`strata verify` fails, and leaves the lock where it is, when an edited artifact matches its migrated JSON but does not pass its kind's current schema.
