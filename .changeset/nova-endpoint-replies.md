---
'@niscorp/nova': minor
'@niscorp/moss': patch
---

An endpoint call that never answers fails. Past its wait it fails to `onError` with "no reply within Nms" (not as an abort, which stays silent) and the transport is told to stop through its signal. The wait is the endpoint's own `timeoutMs` (a grammar addition, nisc.nova 2), else the shell's `endpointTimeoutMs`, else 30s; moss passes `runtime.endpointTimeoutMs` to every server shell. It bounds the first answer only — a reactive read keeps following.

A successful reply is JSON. A success whose body is not JSON used to land in `target` as whatever a fallback read — under moss's wire, `undefined` — and report success; it fails to `onError` now ("the reply is not JSON"). 204/205 succeed with nothing. A failed reply is still read tolerantly for its message.
