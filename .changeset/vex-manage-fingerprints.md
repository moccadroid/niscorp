---
"@niscorp/vex": patch
---

An unlocked endpoint can now refuse fingerprint management: `manageFingerprints: false` on the handler and the Hono and Express adapters answers `PATCH` and `DELETE` with 403 `locked`. It stays on by default, as before, and an adapter mounting an unlocked endpoint with it on logs one warning as it starts.
