---
"@niscorp/tide": patch
---

BREAKING (pending consolidation): nothing unless an app relied on the early firing time in Pacific/Auckland, Antarctica/McMurdo or Pacific/Chatham on the two transition days a year.

A clock time inside a daylight-saving transition now resolves as documented in zones at +12 and +13 too. In Pacific/Auckland, Antarctica/McMurdo and Pacific/Chatham, a daily 02:00 on the spring-forward day (2026-09-27) fired at 01:00, before the asked time; it fires at 03:00, past the gap. In the repeated hour in autumn it took the second occurrence; it takes the first. Occurrence keys do not change, so no run is opened twice or lost. No other zone moves.
