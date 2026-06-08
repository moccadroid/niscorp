import type { QueryEngine } from '../../types.js';
import type { ScopeValues } from '../../scope/scope.types.js';
import type { CacheMode } from '../../cache/cache.types.js';
import { handleDiscovery, handleQuery } from '../../handler.js';

// Minimal structural types — Express.Request/Response satisfy these
// without requiring express as a runtime dependency.

export type VexExpressRequest = {
  method: string;
  body: unknown;
  query: Record<string, unknown>;
};

export type VexExpressResponse = {
  json(body: unknown): unknown;
  status(code: number): VexExpressResponse;
};

export type VexExpressConfig<TReq extends VexExpressRequest = VexExpressRequest> = {
  engine: QueryEngine;
  entities?: string[];
  getScope?: (req: TReq) => Promise<ScopeValues> | ScopeValues;
};

export const vex = <TReq extends VexExpressRequest = VexExpressRequest>(
  config: VexExpressConfig<TReq>,
): ((req: TReq, res: VexExpressResponse) => Promise<void>) => {
  const handlerConfig = { engine: config.engine, entities: config.entities };

  return async (req: TReq, res: VexExpressResponse): Promise<void> => {
    if (req.method === 'GET') {
      res.json(handleDiscovery(handlerConfig));
      return;
    }

    if (req.method === 'POST') {
      const scope = config.getScope ? await config.getScope(req) : {};
      const cacheMode = (String(req.query['cache'] ?? 'use')) as CacheMode;
      const result = await handleQuery(handlerConfig, req.body, scope, cacheMode);
      res.status(result.status).json(result.body);
      return;
    }

    res.status(405).json({ error: 'method_not_allowed', message: 'Use GET for discovery or POST to query' });
  };
};
