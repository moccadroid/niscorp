# Upgrading: moss and charter (P-M7, P-C7)

Two changes. Neither changes a grammar, a table, a type or an exported name.

### @niscorp/moss — a revoked session's socket closes within `sessionRevalidateMs`, however many sockets are open
- Before: every `sessionRevalidateMs` a pass asked the app's `session` verifier about one live socket, waited for the answer, then asked about the next. A pass took as long as all the answers added together. With 200 open sockets, a verifier that answers in 20 ms and `sessionRevalidateMs: 500`, a socket whose token was revoked stayed open for about 6.7 seconds. Three sockets of one browser that present the same token were three calls.
- Now: a pass asks the verifier once for each token, every token at the same moment, and waits for the answers until the next pass is due. In the same example the revoked socket closes within 1 second (one pass plus 20 ms). Three sockets that present one token are one call. An answer that comes after the next pass was due is still acted on when it comes. A pass that came due while the previous one was still waiting starts as soon as that one ends, instead of an interval later. The log line "could not be asked about N of M connection(s)" still counts sockets.
- Who notices: an app whose `runtime.session` is a function of its own (not `'sessions'`) that calls a service with a strict limit on calls at once, or that counts its calls. The verifier is never called more often in total than before, but the calls of a pass now arrive together at its start: with 200 signed-in sockets and 150 distinct tokens, that is 150 calls at once every interval instead of 150 one after another. An app on `session: 'sessions'` sends them as queries through its pool, and the pool queues them.
- What to do: nothing, unless your verifier has such a limit. Then queue inside the verifier (for example a small semaphore around the service call); moss has no option for it.
- Breaking: yes, pending consolidation (an app relying on the verifier being called one socket at a time, or once per socket, sees a different call pattern; no result changes for any verifier that answers each call).

Apps checked:
- Lab apps: none affected. lyceum runs `session: 'sessions'` (`apps/lab/lyceum/src/server/runtime.ts:21`, `postgres-runtime.ts:18`), atrium `'dev-open'` (`apps/lab/atrium/src/server/runtime.ts:26`). relay's expiry check passes an in-memory verifier with `sessionRevalidateMs: 250` (`apps/lab/relay/src/dev/expiry-check.ts:72`); it passes unchanged.
- AnimaApp: `session: 'sessions'` (`src/server/runtime.ts:22`, `:34`). Nothing to change.
- anima-finance: `session: 'sessions'` (`src/server/runtime.ts:32`, `:39`). Nothing to change.
- mira: `session: 'sessions'` (`src/server/runtime.ts:24`, `:31`). Nothing to change.

### @niscorp/charter — a top-level `deny` beside an `actions:` section takes away when the role is resolved without verifying
- Before: `{ r: { actions: ['crm.*'], deny: ['crm.deal.delete'] } }` resolved through `resolveRole` / `resolvePrincipal` to everything under `crm.*`, `crm.deal.delete` included: only the `actions:` section was read. `verifyCharter` refuses such a role (`ambiguous-selection`), so moss never boots it.
- Now: the same role resolves to everything under `crm.*` except `crm.deal.delete`: the top-level `deny` is taken away as well as the section's own `deny`. A top-level `allow` beside an `actions:` section still grants nothing, since reading it would grant more than either selection says. `verifyCharter` refuses the role as before.
- Who notices: only code that calls `resolveRole` or `resolvePrincipal` on a charter it never passed through `verifyCharter`, where a role has both an `actions:` section and a top-level `deny`. Under moss nothing changes: such a charter is refused at boot.
- What to do: nothing. If you resolve charters without verifying, run `verifyCharter` and fix the role it names: move the `deny` into the `actions:` section (`actions: { allow: ['crm.*'], deny: ['crm.deal.delete'] }`).
- Breaking: yes, pending consolidation (a narrowing to what was written; nothing unless code relied on the top-level `deny` being dropped).

Apps checked: no charter in the lab apps (`apps/lab/*/src/app/charter/charter.ts`, `apps/lab/atrium/src/admin/app/charter.ts`, `apps/lab/lyra-admin/src/app/charter.ts`), AnimaApp, anima-finance or mira has a top-level `deny` at all; every `deny` in them is inside a `data:` section (`apps/lab/relay/src/app/charter/charter.ts:18`, `:39`). The direct callers of `resolvePrincipal` (AnimaApp `src/server/billing/gate.ts:15`, `src/server/media/uploads.ts:32`, `src/server/billing/signatures.ts:42`, `src/server/billing/membership.ts:402` and its dev checks; atrium `src/server/assistant/knowledge.ts:111`; relay `src/dev/engine.ts:22`, `src/dev/charter-check.ts`, `src/dev/smoke.ts:62`) see the same result as before.
