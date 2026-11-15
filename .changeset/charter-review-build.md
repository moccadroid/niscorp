---
"@niscorp/charter": patch
---

A role named in `extends` or `without` by a name every object answers to (`constructor`, `toString`, `hasOwnProperty`, `__proto__`) that the charter does not define still resolves as an empty role, and `verifyCharter` now says so as a `shape` warning, as it does for a misspelt key.
