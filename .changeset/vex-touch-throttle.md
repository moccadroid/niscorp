---
"@niscorp/vex": patch
"@niscorp/nisc": patch
---

A replay stamps `lastUsedAt` at most once a minute per fingerprint (`TOUCH_EVERY_MS`), not on every replay. The stamp rewrites the whole cache entry, so every read was also a write; the sweep and discovery's "last used" read it to the minute and stay as accurate as they need to be.
