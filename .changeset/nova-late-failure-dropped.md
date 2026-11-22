---
"@niscorp/nova": patch
---

BREAKING (pending consolidation): nothing unless an app relied on a late failure of an older call overwriting `errorTarget` after a newer call of the same endpoint already came back.

A failed call whose newer call of the same endpoint has already come back no longer writes `errorTarget`, the same rule a late success already follows for `target`. Search "a" (slow, fails), then "ab" (fast, succeeds): the rows show "ab" and the error stays empty, where the late failure wrote it. The call's `onError` steps still run. A failure that comes back while the newer call is still on its way is written, as before.
