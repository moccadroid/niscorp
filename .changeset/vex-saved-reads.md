---
'@niscorp/vex': minor
'@niscorp/loom': minor
---

Vex keeps what an entry it writes was written from, and says who asks when it looks one up. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-14: a `mapToShape` an app writes answers `config`, the Prism config its `ir` was compiled from, beside `ir` and `transformed`. `createShapeMapper` does.

- **A query vex writes keeps its mapping's Prism config** (`mapping`, on the entry), beside the compiled form. A compiled form can neither be read back as a config nor upgraded when Prism changes.
- **The Postgres cache's table gets a `mapping` column**, in a new migration, `nisc.vex.cache/2`. A deployment that runs its migrations before it boots runs that one first.
- **`CacheBackend.get(key, scope?)`**: the two lookups that replay an entry hand the cache the scope of whoever asks, so a cache can answer an entry to some callers and not to others. A backend that takes no scope works as before.
- **`@niscorp/vex/migrations`** exports `VEX_SEQUENCE`, one stored kind, `nisc.vex/entry` (an entry as written, its `mapping` a `nisc.prism/config`), and `VEX_SCHEMAS`.
