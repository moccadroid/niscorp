import { handleQuery, handleDiscovery, handleFingerprintPatch, handleFingerprintDelete } from '@niscorp/vex';
import { getVexRuntime, CURRENT_USER_ID } from '../runtime';
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
  const scope = { userId: CURRENT_USER_ID };
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
  // contain '/', so they don't travel in the path).
  if (method === 'PATCH' || method === 'DELETE') {
    const b = (body ?? {}) as { fingerprint?: unknown; protected?: boolean };
    if (typeof b.fingerprint !== 'string' || b.fingerprint === '') {
      return wrap(400, { error: 'invalid_request', message: 'Body must carry a `fingerprint`.' });
    }
    const res = method === 'PATCH'
      ? await handleFingerprintPatch({ engine }, b.fingerprint, { protected: b.protected })
      : await handleFingerprintDelete({ engine }, b.fingerprint);
    return wrap(res.status, res.body);
  }

  const res = await handleQuery({ engine, entities }, body, scope);
  return wrap(res.status, res.body);
};
