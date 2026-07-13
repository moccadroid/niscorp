import { handleQuery, handleDiscovery } from '@niscorp/vex';
import { getVexRuntime } from '../runtime';
import { handleWrite } from './writes';

// ═══════════════════════════════════════════════════════════
// Fable's API, in the browser.
//
// Nova's HTTP endpoints call an injected `fetch`. Reads are served by Vex's
// OWN HTTP handler against the in-process PGlite engine — the SAME handler a
// real server runs. Writes are plain handlers (writes.ts). So this is the
// production shape: when there is a real backend, drop this shim and point
// the URLs at it, nothing changes.
//
//   GET  /api/todos/vex        → discovery
//   POST /api/todos/vex        → a query { fingerprint, context }
//   POST /api/todos/<write>    → save / set-done / delete
//
// Real URLs fall through to fetch.
// ═══════════════════════════════════════════════════════════

const ENTITIES = ['todos'];

const pathOf = (url: string): string => {
  try {
    return new URL(url, 'http://fable.local').pathname;
  } catch {
    return url;
  }
};

type Init = { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal };
type Resp = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };

const wrap = (status: number, body: unknown): Resp => ({
  ok: status < 400,
  status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

const parseBody = (init?: Init): unknown => (init?.body !== undefined ? JSON.parse(init.body) : {});

export const fableFetch = async (url: string, init?: Init): Promise<Resp> => {
  const path = pathOf(url);
  const method = (init?.method ?? 'GET').toUpperCase();

  if (path === '/api/todos/vex') {
    const { engine } = await getVexRuntime();
    if (method === 'GET') {
      return wrap(200, await handleDiscovery({ engine, entities: ENTITIES }));
    }
    const res = await handleQuery({ engine, entities: ENTITIES }, parseBody(init), {});
    return wrap(res.status, res.body);
  }

  if (path.startsWith('/api/todos/') && method === 'POST') {
    const { db } = await getVexRuntime();
    const res = await handleWrite(db, path, parseBody(init));
    if (res !== undefined) return wrap(res.status, res.body);
    return wrap(404, { error: 'unknown_endpoint', message: path });
  }

  return window.fetch(url, init);
};
