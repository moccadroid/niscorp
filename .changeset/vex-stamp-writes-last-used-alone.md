---
"@niscorp/vex": patch
---

BREAKING (pending consolidation): nothing unless a host wraps a built-in cache by spreading it and overriding `set` to watch writes: the "last used" stamps no longer reach that `set`.

The "last used" stamp a replay writes now writes `lastUsedAt` alone, through a new optional `CacheBackend.touch(key, lastUsedAt)`. A `PATCH` (unprotect) or a reseed that lands between a replay's read and its stamp is no longer undone, and the tiered cache no longer copies a stale L1 entry over the shared L2 when it stamps. The memory, Postgres and tiered caches implement `touch`; a backend without it is stamped through `set`, as before.
