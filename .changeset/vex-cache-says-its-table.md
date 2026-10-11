---
'@niscorp/vex': patch
---

A cache that keeps its entries in a table says which one.

- `CacheBackend` gains an optional `table: { schema, name }`: where a backend that keeps its entries in a database's table keeps them. `createPostgresCache` answers it (`{ schema: 'public', name: 'vex_cache' }` unless the deployment said otherwise), a tiered cache answers its durable tier's, and the memory cache has none.
- It is for a host that hands out access table by table: what is in the cache's table is every entry the engine replays, and the host refuses that table to anybody else under whatever name it was given. Moss reads it for a feature's own entries.
- A backend an app wrote itself has nothing to change: the field is optional, and one that keeps a table a host serves may say so.
