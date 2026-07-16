import { handleQuery, handleDiscovery, handleFingerprintPatch, handleFingerprintDelete } from '@niscorp/vex';
import { getVexRuntime } from '../runtime';
import { identity } from '../../auth';
import { resourceEntities } from './resources';
import { policyForPrincipal } from '../../charter/session-policy';

// ═══════════════════════════════════════════════════════════
// Vex-as-HTTP, in the browser.
//
// Nova's HTTP endpoints call an injected `fetch`. We serve Vex resource URLs by
// calling Vex's OWN HTTP handlers against the in-browser PGlite engine — the
// SAME handlers a real server runs. So this is the production shape: when there
// is a real backend, drop this shim and point the URLs at it, nothing changes.
//
//   GET  /api/<resource>/vex   → discovery, scoped to that resource's entities
//   POST /api/<resource>/vex   → a query — `{ fingerprint, context }` (replay) or
//                                `{ intent, shape, context }` (generate) — or a
//                                mutation `{ mutation, context }` (write); the
//                                body discriminates. Reads are entity-scoped.
//   PATCH/DELETE .../vex       → fingerprint management ({ fingerprint } in body)
//   GET/POST /api/vex          → the base: full schema (cross-resource reads)
//
// The entity filter comes from `resources.ts`. Real URLs fall through to fetch.
// ═══════════════════════════════════════════════════════════

const pathOf = (url: string): string => {
  try {
    return new URL(url, 'http://relay.local').pathname;
  } catch {
    return url;
  }
};

const isVex = (url: string): boolean => pathOf(url).endsWith('/vex');

type Init = { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal };
type Resp = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };

const wrap = (status: number, body: unknown): Resp => ({
  ok: status < 400,
  status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

export const vexFetch = async (url: string, init?: Init): Promise<Resp> => {
  if (!isVex(url)) return window.fetch(url, init as RequestInit) as unknown as Resp;

  const parsed = new URL(url, 'http://relay.local');
  const entities = resourceEntities(parsed.pathname);
  const { engine, db } = await getVexRuntime();
  const who = identity();
  // Scope VALUES come from the session token, per request — never
  // client-supplied. The scope POLICY is the principal's charter-compiled
  // one: which read/write phases exist for THEM (untrusted surface). An
  // ungranted phase is absent → vex's default-deny refuses it.
  const scope = { userId: who?.userId ?? 'anonymous' };
  const policy = policyForPrincipal(who?.userId ?? null);
  const method = (init?.method ?? 'GET').toUpperCase();

  // Discovery is served UNGOVERNED — catalog metadata (fingerprints, shapes,
  // intents, mutation signatures) goes to any principal, anonymous included.
  // Known and deferred, not an oversight: filtering discovery per principal
  // is the app server's job (the served catalog), not this client proof's.
  if (method === 'GET') {
    const body = await handleDiscovery({ engine, entities });
    return wrap(200, body);
  }

  const body: unknown = init?.body !== undefined ? JSON.parse(init.body) : {};

  // Fingerprint management: `{ fingerprint, protected? }` in the body (names
  // contain '/', so they don't travel in the path). Locked: refused (403).
  if (method === 'PATCH' || method === 'DELETE') {
    const b = (body ?? {}) as { fingerprint?: unknown; protected?: boolean };
    if (typeof b.fingerprint !== 'string' || b.fingerprint === '') {
      return wrap(400, { error: 'invalid_request', message: 'Body must carry a `fingerprint`.' });
    }
    const res = method === 'PATCH'
      ? await handleFingerprintPatch({ engine, locked: true }, b.fingerprint, { protected: b.protected })
      : await handleFingerprintDelete({ engine, locked: true }, b.fingerprint);
    return wrap(res.status, res.body);
  }

  // ONE wire shape — `{ fingerprint, context }` — for reads AND writes; the
  // entry's kind picks the pipeline. The human surface is replay-only:
  // `locked: true` means an unknown or drifted read gets 400 `locked`, and
  // writes are replay-only ALWAYS (a mutation def never travels — an inline
  // `{ mutation }` body is not a request shape at all). The principal's
  // compiled policy governs BOTH sides: reads via `scopePolicy`, writes via
  // `mutations.policy` — same policy, so a viewer (no write phase) has their
  // mark-won refused as `scope_denied`. Ray's `query` tool and the architect
  // keep their own generative engine path on the engine's full default.
  const res = await handleQuery(
    { engine, entities, locked: true, scopePolicy: policy, mutations: { client: db, policy } },
    body,
    scope,
  );
  return wrap(res.status, res.body);
};

// Vex replies `{ result, meta }`. Endpoints want the data; the devtools
// trace wants the envelope — so this unwrap composes OUTSIDE the trace tee
// (`unwrapResult(traceFetch(vexFetch))`): the timeline records the full
// reply, actions receive `result` itself, and no endpoint needs a
// `response` prism to lift it.
export const unwrapResult = (inner: typeof vexFetch): typeof vexFetch => async (url, init) => {
  const res = await inner(url, init);
  if (!isVex(url) || !res.ok) return res;
  const body = (await res.json()) as Record<string, unknown> | null;
  if (body === null || typeof body !== 'object' || !('result' in body)) return wrap(res.status, body);
  return wrap(res.status, body['result']);
};
