---
"@niscorp/moss": patch
---

The docs say what a boot does with the tables since `nisc migrate`: it checks them and refuses to start while a migration is pending, and applies them only under `migrations: 'apply'`. The sessions table, the boot order, a feature's sequences and how an old database adopts the ledger now read that way.

**What to change:** nothing. Documentation only.
