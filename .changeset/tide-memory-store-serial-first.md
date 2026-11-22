---
"@niscorp/tide": patch
---

BREAKING (pending consolidation): nothing unless an app's tests on `createMemoryStore()` relied on which tasks a claim takes when the claim limit bites and a reflex has `order: 'serial'`.

The memory store claims the serial groups (`onePer.only`) first, one row each, and gives what they leave of the limit to the other rows, as the Postgres store does. With limit 1, a parallel task ordered first and a serial task second, it claimed the parallel one and Postgres the serial one; both now claim the serial one. Nothing changes when the limit does not bite. The docs say a host's own store should do the same.
