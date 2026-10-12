import { Hono } from 'hono';
import type { Context, Env } from 'hono';
import type { QueryEngine } from '../../types.js';
import type { ScopePolicy, ScopeValues } from '../../scope/scope.types.js';
import type { MutationClient } from '../../mutations/engine.js';
import { handleDiscovery, handleQuery, handleFingerprintPatch, handleFingerprintDelete } from '../../handler.js';
import type { WriteEvent, ExecuteRecord, VexLive } from '../../handler.js';
import type { QueryResponse } from '../../schemas/request.schema.js';

// A request made in-process may carry a follower under this key in hono's env
// (`app.request(url, init, env)`). One off the network cannot: its env is the
// runtime's, which nothing a client sends reaches.
export const VEX_LIVE_ENV = 'vexLive';

const liveOf = (env: unknown): VexLive | undefined => {
  if (env === null || typeof env !== 'object' || !(VEX_LIVE_ENV in env)) return undefined;
  const live: unknown = Reflect.get(env, VEX_LIVE_ENV);
  if (live === null || typeof live !== 'object' || !('signal' in live) || !('onChange' in live)) return undefined;
  const { signal, onChange } = live;
  if (!(signal instanceof AbortSignal) || typeof onChange !== 'function') return undefined;
  return { signal, onChange: (response: QueryResponse) => void Reflect.apply(onChange, undefined, [response]) };
};

export type VexHonoConfig<E extends Env = Env> = {
  engine: QueryEngine;
  entities?: string[];
  locked?: boolean;
  getScope?: (c: Context<E>) => Promise<ScopeValues> | ScopeValues;
  getPolicy?: (c: Context<E>) => Promise<ScopePolicy | undefined> | ScopePolicy | undefined;
  getPolicyForReach?: (c: Context<E>, reach: string) => Promise<ScopePolicy | undefined> | ScopePolicy | undefined;
  mutations?: {
    client: MutationClient;
    policy?: ScopePolicy;
    onWrite?: (event: WriteEvent) => void;
  };
  onExecute?: (record: ExecuteRecord) => void;
};

// A fingerprint may contain '/' (a named slot such as "deals/table"), so it
// travels in the request body, not the path.
const fingerprintFromBody = (body: unknown): string | undefined => {
  if (body === null || typeof body !== 'object') return undefined;
  const fp = (body as Record<string, unknown>)['fingerprint'];
  return typeof fp === 'string' && fp.length > 0 ? fp : undefined;
};

const NOT_JSON = { error: 'invalid_request', message: 'Body must be JSON' };

export const vex = <E extends Env = Env>(config: VexHonoConfig<E>): Hono<E> => {
  const app = new Hono<E>();
  // Read through hono's own `c.req.json()`, which shares hono's body cache with
  // a host middleware that read the body first.
  const jsonBodyOf = async (c: Context<E>): Promise<{ parsed: true; body: unknown } | { parsed: false }> => {
    try {
      const body: unknown = await c.req.json();
      return { parsed: true, body };
    } catch (err) {
      if (err instanceof SyntaxError) return { parsed: false };
      throw err;
    }
  };
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
  // Fingerprint management is an operator's surface, not a principal's: it
  // carries no per-request policy.
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
