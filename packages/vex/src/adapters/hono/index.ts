import { Hono } from 'hono';
import type { Context, Env } from 'hono';
import type { QueryEngine } from '../../types.js';
import type { ScopePolicy, ScopeValues } from '../../scope/scope.types.js';
import type { MutationClient } from '../../mutations/engine.js';
import { handleDiscovery, handleQuery, handleFingerprintPatch, handleFingerprintDelete } from '../../handler.js';
import type { WriteEvent } from '../../handler.js';

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
};

// Fingerprints may contain '/' (named slots like "deals/table"), so
// management rides the request BODY, not the path.
const fingerprintFromBody = (body: unknown): string | undefined => {
  if (body === null || typeof body !== 'object') return undefined;
  const fp = (body as Record<string, unknown>)['fingerprint'];
  return typeof fp === 'string' && fp.length > 0 ? fp : undefined;
};

export const vex = <E extends Env = Env>(config: VexHonoConfig<E>): Hono<E> => {
  const app = new Hono<E>();
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
    const body: unknown = await c.req.json();
    const result = await handleQuery(await requestConfig(c), body, scope);
    return c.json(result.body, result.status as 200);
  });

  app.patch('/', async (c) => {
    const body: unknown = await c.req.json();
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
    const body: unknown = await c.req.json();
    const fingerprint = fingerprintFromBody(body);
    if (fingerprint === undefined) {
      return c.json({ error: 'invalid_request', message: 'Body must include { fingerprint }' }, 400);
    }
    const result = await handleFingerprintDelete(handlerConfig, fingerprint);
    return c.json(result.body, result.status as 200);
  });

  return app;
};
