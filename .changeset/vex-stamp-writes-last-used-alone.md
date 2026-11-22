---
"@niscorp/vex": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host wraps a built-in cache by spreading it and overriding `set` to watch writes: the "last used" stamps go through the `touch` the wrapper inherits and do not reach that `set`.

The "last used" stamp a replay writes now writes `lastUsedAt` alone, through a new optional `CacheBackend.touch(key, lastUsedAt)`, wherever the cache the engine is given has `touch`. There, a `PATCH` (unprotect) or a reseed that lands between a replay's read and its stamp is kept, and a tiered cache stamps L1 and L2 without copying L1's entry over L2. The memory, Postgres and tiered caches implement `touch`; a backend without it is stamped through `set` with the whole entry, as before, and keeps the race. moss's entry cache has no `touch`, so every moss app keeps stamping through `set`.
