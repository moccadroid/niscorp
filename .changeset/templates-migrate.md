---
"create-nisc": patch
"@niscorp/nisc": patch
---

A moss app's `nisc.config.ts` hands over `app` and `runtime`, so `nisc migrate` works the day the app moves to a real database; `boot` uses the same `runtime`, so the tables `nisc migrate` applies are the ones the boot checks. The in-memory runtime writes `migrations: 'apply'` and no longer calls `cache.init()`.

AGENTS.md rule 17: a real database's tables change only through `nisc migrate`; a boot checks them; only a runtime whose database starts empty every time writes `migrations: 'apply'`; every sequence that has run stays in `runtime.tables`; one app per database schema.

**What to change:** an app already made from the moss template writes `migrations: 'apply'` in its in-memory runtime when it takes this release (see the moss changeset): without it, its boot refuses with `PENDING`. A new app gets all of the above.
