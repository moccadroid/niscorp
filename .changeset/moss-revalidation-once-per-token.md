---
"@niscorp/moss": patch
---

BREAKING (pending consolidation): nothing unless the app's `session` verifier relied on being called one connection at a time, or once for each connection.

A revoked session's socket now closes within `sessionRevalidateMs` however many connections are open: each revalidation pass asks the verifier once for each token, every token at the same moment, instead of one connection after another (200 connections with a 20 ms verifier and `sessionRevalidateMs: 500` closed a revoked socket after about 6.7 seconds). Connections that present one token share one call, so the verifier is never called more often than before; the calls now come together at the start of each pass, which a verifier with a strict limit on calls at once sees as a burst every interval. A pass that comes due while the previous one is still waiting for answers starts as soon as that one ends, instead of an interval later. The log line for a verifier that could not be asked still counts connections.
