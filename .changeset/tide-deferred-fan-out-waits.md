---
"@niscorp/tide": patch
---

BREAKING (pending consolidation): nothing unless an app relied on a run whose fan-out failed in a host seam being tried again on the very next `advance`; it is now tried after the reflex's retry wait (with the default policy 60 s, then 120 s, then 240 s).

A run whose fan-out fails in a host seam (a database down, a broken template) stays `pending` as before, and is tried again after a wait taken from the reflex's own `policy.retry` (`baseMs`, growing by `backoff` over the first `max` deferrals, then staying that long). While it waits, the pending runs behind it fan out: a page of such runs no longer keeps every other run from fanning out. The waits are kept in each engine's memory, so after a restart a deferred run is tried once at once and then waits again. A run whose reflex a load left out is still skipped on the next `advance`.
