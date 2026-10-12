---
'@niscorp/moss': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

`server.invalidateTenant(tag)` is `server.invalidateTag(tag)`. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-12: call `server.invalidateTag(tag)` where the app called `server.invalidateTenant(tag)`.

- It forgets every identity record that carries one cache tag (`IdentityRecord.tag`). The field named the mechanism and the method named one use of it, a tenant, which moss does not know. The method is named for what it takes. It does what it did.
- The signal it sends the other processes of a deployment is `invalidate-tag`, where it was `invalidate-tenant`. Processes on the old and the new release do not hear each other's during a rolling deploy: a record forgotten in one is forgotten in the other when it is next resolved again (`sessionRevalidateMs`).
- Nothing else of moss changes, and the CLI and `@niscorp/nisc` change only in the moss they bring.
