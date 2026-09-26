---
"@niscorp/vex": minor
"@niscorp/moss": minor
"@niscorp/loom": minor
"@niscorp/nisc": minor
---

Tables go through strata's ledger. vex's cache table and moss's own tables (integrations, sessions, the generation pointer, the tide store) are strata sequences, applied once and recorded instead of converged with `IF NOT EXISTS` on every boot. Migration 1 of each is that old DDL verbatim, so an existing database adopts on its next boot. New required peer: `@niscorp/strata`. moss's runtime gains `migrations: 'apply' | 'verify'`.
