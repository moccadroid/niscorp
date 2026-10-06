import { Hono } from 'hono';
import type { Context, Env } from 'hono';
import type { QueryEngine } from '../../types.js';
import type { ScopePolicy, ScopeValues } from '../../scope/scope.types.js';
import type { MutationClient } from '../../mutations/engine.js';
import { handleDiscovery, handleQuery, handleFingerprintPatch, handleFingerprintDelete } from '../../handler.js';
import type { WriteEvent, ExecuteRecord, VexLive } from '../../handler.js';
import type { QueryResponse } from '../../schemas/request.schema.js';

// A request made IN-PROCESS may carry a follower in hono's env — the third
// argument of `app.request(url, init, env)` — under this key. A request off
// the network never can: its env is the runtime's (node's sockets, a
// worker's bindings), so nothing a client sends reaches it. See `VexLive`.
export const VEX_LIVE_ENV = 'vexLive';

const liveOf = (env: unknown): VexLive | undefined => {
  if (env === null || typeof env !== 'object' || !(VEX_LIVE_ENV in env)) return undefined;
  const live: unknown = Reflect.get(env, VEX_LIVE_ENV);
  if (live === null || typeof live !== 'object' || !('signal' in live) || !('onChange' in live)) return undefined;
  const { signal, onChange } = live;
  if (!(signal instanceof AbortSignal) || typeof onChange !== 'function') return undefined;
  return { signal, onChange: (response: QueryResponse) => void Reflect.apply(onChange, undefined, [response]) };
};

// Generic over the hono Env so a host that mounts this under its own app
// (with typed context variables — e.g. the resolved principal) reads them
// in `getScope`/`getPolicy` without casts.
export type VexHonoConfig<E extends Env = Env> = {
  engine: QueryEngine;
  entities?: string[];
  // Replay-only posture: no generation, no fingerprint management.
  // (Writes are unaffected — mutation replay is always replay-only.)
  locked?: boolean;
  getScope?: (c: Context<E>) => Promise<ScopeValues> | ScopeValues;
  // Per-request ScopePolicy — a host that resolves policy per principal
  // (e.g. compiled from an ACL layer at login) returns it here; it governs
  // reads, mutation replay AND discovery on this endpoint. Absent (or
  // returning undefined), the engine default and `mutations.policy` apply.
  getPolicy?: (c: Context<E>) => Promise<ScopePolicy | undefined> | ScopePolicy | undefined;
  // The same principal's policy at a reach an entry demands — see
  // `OkCacheEntry.reach`. Bound per request, because the principal is.
  getPolicyForReach?: (c: Context<E>, reach: string) => Promise<ScopePolicy | undefined> | ScopePolicy | undefined;
  // Enables replay of `kind: 'mutation'` cache entries on this endpoint.
  // `policy` is the static fallback when `getPolicy` is absent; at least
  // one of the two must supply a policy for writes to run.
  // `onWrite` is the handler's write observer, passed through verbatim —
  // fired after a successful commit with per-statement writes and scope.
  mutations?: {
    client: MutationClient;
    policy?: ScopePolicy;
    onWrite?: (event: WriteEvent) => void;
  };
  // The execution observer, passed through verbatim — fired once per query or
  // mutation with vex-vocabulary facts. See `VexHandlerConfig.onExecute`.
  onExecute?: (record: ExecuteRecord) => void;
};

// Fingerprints may contain '/' (named slots like "deals/table"), so
// management rides the request BODY, not the path.
const fingerprintFromBody = (body: unknown): string | undefined => {
  if (body === null || typeof body !== 'object') return undefined;
  const fp = (body as Record<string, unknown>)['fingerprint'];
  return typeof fp === 'string' && fp.length > 0 ? fp : undefined;
};

// A body that is not JSON is the request's mistake, not the server's: it is
// answered 400 in the surface's own error shape instead of thrown out of the
// route. The content type is never read: JSON sent as text/plain (what `fetch`
// sends for a string body) parses as it always has.
const NOT_JSON = { error: 'invalid_request', message: 'Body must be JSON' };

export const vex = <E extends Env = Env>(config: VexHonoConfig<E>): Hono<E> => {
  const app = new Hono<E>();
  // The body is read through hono's own `c.req.json()`, as it always was — so
  // a host middleware that read it first still shares hono's cache with this
  // adapter (before hono 4.2 that cache was kept per reader; reading the body
  // any other way here answered 500 to a valid request behind one). Only the
  // parse failing is caught: a body that cannot be read at all — consumed
  // outside hono, a stream that broke — is still a fault and still throws.
  const jsonBodyOf = async (c: Context<E>): Promise<{ parsed: true; body: unknown } | { parsed: false }> => {
    try {
      const body: unknown = await c.req.json();
      return { parsed: true, body };
    } catch (err) {
      if (err instanceof SyntaxError) return { parsed: false };
      throw err;
    }
  };
  // The per-request policy (when configured) overrides everything policy-
  // shaped: reads (scopePolicy), writes (mutations.policy) and discovery.
  const requestConfig = async (c: Context<E>) => {
    const policy = config.getPolicy ? await config.getPolicy(c) : undefined;
    const mutationPolicy = policy ?? config.mutations?.policy;
    return {
      engine: config.engine,
      entities: config.entities,
      ...(config.locked === true ? { locked: true } : {}),
      ...(policy !== undefined ? { scopePolicy: policy } : {}),
      ...(config.getPolicyForReach !== undefined
        ? { policyForReach: (reach: string) => config.getPolicyForReach?.(c, reach) }
        : {}),
      ...(config.onExecute !== undefined ? { onExecute: config.onExecute } : {}),
      ...(config.mutations !== undefined && mutationPolicy !== undefined
        ? {
            mutations: {
              client: config.mutations.client,
              policy: mutationPolicy,
              ...(config.mutations.onWrite !== undefined ? { onWrite: config.mutations.onWrite } : {}),
            },
          }
        : {}),
    };
  };
  // Fingerprint management carries no per-request policy — it is refused
  // under `locked` and is an operator surface, not a principal one.
  const handlerConfig = {
    engine: config.engine,
    entities: config.entities,
    ...(config.locked === true ? { locked: true } : {}),
  };

  app.get('/', async (c) => c.json(await handleDiscovery(await requestConfig(c))));

  app.post('/', async (c) => {
    const scope = config.getScope ? await config.getScope(c) : {};
    const read = await jsonBodyOf(c);
    if (!read.parsed) return c.json(NOT_JSON, 400);
    const result = await handleQuery(await requestConfig(c), read.body, scope, liveOf(c.env));
    return c.json(result.body, result.status as 200);
  });

  app.patch('/', async (c) => {
    const read = await jsonBodyOf(c);
    if (!read.parsed) return c.json(NOT_JSON, 400);
    const body = read.body;
    const fingerprint = fingerprintFromBody(body);
    if (fingerprint === undefined) {
      return c.json({ error: 'invalid_request', message: 'Body must include { fingerprint }' }, 400);
    }
    const wanted = (body as Record<string, unknown>)['protected'];
    const result = await handleFingerprintPatch(handlerConfig, fingerprint, {
      ...(typeof wanted === 'boolean' ? { protected: wanted } : {}),
    });
    return c.json(result.body, result.status as 200);
  });

  app.delete('/', async (c) => {
    const read = await jsonBodyOf(c);
    if (!read.parsed) return c.json(NOT_JSON, 400);
    const fingerprint = fingerprintFromBody(read.body);
    if (fingerprint === undefined) {
      return c.json({ error: 'invalid_request', message: 'Body must include { fingerprint }' }, 400);
    }
    const result = await handleFingerprintDelete(handlerConfig, fingerprint);
    return c.json(result.body, result.status as 200);
  });

  return app;
};
