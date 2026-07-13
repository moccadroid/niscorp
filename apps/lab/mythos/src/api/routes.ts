import { z } from 'zod';
import { VexError } from '@niscorp/vex';
import type { QueryEngine } from '@niscorp/vex';
import type { FetchFn } from '@niscorp/nova';
import type { PGlite } from '@electric-sql/pglite';
import { createTodo, deleteTodo, setTodoDone, updateTodo } from './todos.write';
import type { HandlerResult } from './todos.write';

// ───────────────────────────────────────────────────────────
// The endpoint contract (D2): actions fetch URLs; this table
// serves them in-process over PGlite. Swapping it for a real
// server never touches an action.
//
// Reads go through ONE reader: POST /api/query with
// `{ fingerprint, context }` — replay-only (locked), so an unknown
// fingerprint (a missed prewarm, a discipline break) is a loud 500,
// not a silent LLM call. `today` is stamped server-side.
// ───────────────────────────────────────────────────────────

const QueryBodySchema = z
  .object({
    fingerprint: z.string().min(1),
    context: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type ApiDeps = { db: PGlite; engine: QueryEngine; today: string };

type RouteHandler = (deps: ApiDeps, params: Record<string, string | undefined>, body: unknown) => Promise<HandlerResult>;
type Route = { method: string; pattern: RegExp; handle: RouteHandler };

const UUID_SEG = '(?<id>[0-9a-fA-F-]{36})';

const runQuery: RouteHandler = async (deps, _params, body) => {
  const parsed = QueryBodySchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { message: 'invalid query request' } };
  const response = await deps.engine.execute(
    { fingerprint: parsed.data.fingerprint, context: { ...parsed.data.context, today: deps.today } },
    { locked: true, scope: {} },
  );
  const missing = response.meta.missingContext ?? [];
  if (missing.length > 0) {
    return { status: 500, body: { message: `query is missing context: ${missing.join(', ')}` } };
  }
  return { status: 200, body: response.result };
};

const ROUTES: Route[] = [
  { method: 'POST', pattern: /^\/api\/query$/, handle: runQuery },
  { method: 'POST', pattern: /^\/api\/todos$/, handle: (deps, _p, body) => createTodo(deps, body) },
  { method: 'PUT', pattern: new RegExp(`^/api/todos/${UUID_SEG}$`), handle: (deps, p, body) => updateTodo(deps, p['id'] ?? '', body) },
  { method: 'POST', pattern: new RegExp(`^/api/todos/${UUID_SEG}/done$`), handle: (deps, p, body) => setTodoDone(deps, p['id'] ?? '', body) },
  { method: 'DELETE', pattern: new RegExp(`^/api/todos/${UUID_SEG}$`), handle: (deps, p) => deleteTodo(deps, p['id'] ?? '') },
];

const respond = (status: number, body: unknown): Awaited<ReturnType<FetchFn>> => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

export const createApiFetch = (deps: ApiDeps): FetchFn => async (url, init) => {
  const method = init?.method ?? 'GET';
  const path = url.split('?')[0] ?? url;

  const route = ROUTES.find((r) => r.method === method && r.pattern.test(path));
  if (route === undefined) return respond(404, { message: `no handler for ${method} ${path}` });

  let body: unknown;
  if (init?.body !== undefined) {
    try {
      body = JSON.parse(init.body);
    } catch {
      return respond(400, { message: 'request body is not valid JSON' });
    }
  }

  try {
    const result = await route.handle(deps, route.pattern.exec(path)?.groups ?? {}, body);
    return respond(result.status, result.body);
  } catch (err) {
    if (err instanceof VexError) {
      // cache_miss = a read nobody prewarmed. That is a bug, not a 4xx.
      const status = err.code === 'cache_miss' || err.code === 'agent_failed' ? 500 : 400;
      return respond(status, { message: `${err.code}: ${err.message}` });
    }
    return respond(500, { message: err instanceof Error ? err.message : 'internal error' });
  }
};
