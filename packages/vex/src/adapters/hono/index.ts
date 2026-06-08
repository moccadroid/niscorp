import { Hono } from 'hono';
import type { Context } from 'hono';
import type { QueryEngine } from '../../types.js';
import type { ScopeValues } from '../../scope/scope.types.js';
import type { CacheMode } from '../../cache/cache.types.js';
import { handleDiscovery, handleQuery } from '../../handler.js';

export type VexHonoConfig = {
  engine: QueryEngine;
  entities?: string[];
  getScope?: (c: Context) => Promise<ScopeValues> | ScopeValues;
};

export const vex = (config: VexHonoConfig): Hono => {
  const app = new Hono();
  const handlerConfig = { engine: config.engine, entities: config.entities };

  app.get('/', (c) => c.json(handleDiscovery(handlerConfig)));

  app.post('/', async (c) => {
    const scope = config.getScope ? await config.getScope(c) : {};
    const cacheMode = (c.req.query('cache') ?? 'use') as CacheMode;
    const body: unknown = await c.req.json();
    const result = await handleQuery(handlerConfig, body, scope, cacheMode);
    return c.json(result.body, result.status as 200);
  });

  return app;
};
