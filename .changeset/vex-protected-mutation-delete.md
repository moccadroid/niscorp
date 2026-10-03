---
'@niscorp/vex': patch
---

`DELETE` on an unlocked fingerprint endpoint refuses a protected mutation entry with 409 `fingerprint_protected`, as it already did a protected read. A seeded write could be evicted by anyone who could reach the endpoint. A locked endpoint (every endpoint moss serves) was never affected.
