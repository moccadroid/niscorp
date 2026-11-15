---
"@niscorp/moss": patch
---

A webhook sent chunked, or with `Expect`, `Keep-Alive` or `Upgrade`, now reaches the integration's service instead of answering `502`: the door leaves those four headers behind.
