import { Hono } from 'hono';
import type { Context } from 'hono';
import type { QueryEngine } from '../../types.js';
import type { ScopeValues } from '../../scope/scope.types.js';
import type { VexHandlerConfig } from '../../handler.js';
import { handleDiscovery, handleQuery, handleFingerprintPatch, handleFingerprintDelete } from '../../handler.js';

export type VexHonoConfig = {
  engine: QueryEngine;
  entities?: string[];
  // Replay-only posture: no generation, no fingerprint management.
  // (Writes are unaffected — mutation replay is always replay-only.)
  locked?: boolean;
  getScope?: (c: Context) => Promise<ScopeValues> | ScopeValues;
  // Enables replay of `kind: 'mutation'` cache entries on this endpoint.
  mutations?: VexHandlerConfig['mutations'];
};

// Fingerprints may contain '/' (named slots like "deals/table"), so
// management rides the request BODY, not the path.
const fingerprintFromBody = (body: unknown): string | undefined => {
  if (body === null || typeof body !== 'object') return undefined;
  const fp = (body as Record<string, unknown>)['fingerprint'];
  return typeof fp === 'string' && fp.length > 0 ? fp : undefined;
};

export const vex = (config: VexHonoConfig): Hono => {
  const app = new Hono();
  const handlerConfig = {
    engine: config.engine,
    entities: config.entities,
    ...(config.locked === true ? { locked: true } : {}),
    ...(config.mutations !== undefined ? { mutations: config.mutations } : {}),
  };

  app.get('/', async (c) => c.json(await handleDiscovery(handlerConfig)));

  app.post('/', async (c) => {
    const scope = config.getScope ? await config.getScope(c) : {};
    const body: unknown = await c.req.json();
    const result = await handleQuery(handlerConfig, body, scope);
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
