import { handleQuery, handleDiscovery, handleFingerprintPatch, handleFingerprintDelete } from '@niscorp/vex';
import { getVexRuntime } from '../runtime';
import { identity } from '../../auth';
import { resourceEntities } from './resources';
import { handleMutation } from '../mutations';
import { scopePolicy } from '../scope';

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
  // Scope comes from the session TOKEN, per request — never client-supplied,
  // never a constant. Anonymous requests scope to a user that owns nothing.
  const scope = { userId: identity()?.userId ?? 'anonymous' };
  const method = (init?.method ?? 'GET').toUpperCase();

  if (method === 'GET') {
    const body = await handleDiscovery({ engine, entities });
    return wrap(200, body);
  }

  const body: unknown = init?.body !== undefined ? JSON.parse(init.body) : {};

  // A write is self-describing: a `{ mutation, context }` body. Scope is injected
  // here (never client-supplied); the engine stamps identity + applies RLS.
  if (body !== null && typeof body === 'object' && 'mutation' in body) {
    const schema = engine.getSchema();
    if (schema === undefined) return wrap(500, { error: 'no_schema', message: 'Vex schema not introspected' });
    const res = await handleMutation({ db, schema, policy: scopePolicy }, body, scope);
    return wrap(res.status, res.body);
  }

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

  // The human surface is replay-only: `locked: true` means an unknown or
  // drifted fingerprint gets 400 `locked` — every read every action makes
  // must replay from the protected seeds. Ray's `query` tool and the
  // architect keep their own generative engine path; the split is the
  // posture, not an accident.
  const res = await handleQuery({ engine, entities, locked: true }, body, scope);
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
