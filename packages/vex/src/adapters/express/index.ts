import type { QueryEngine } from '../../types.js';
import type { ScopeValues } from '../../scope/scope.types.js';
import { handleDiscovery, handleQuery, handleFingerprintPatch, handleFingerprintDelete } from '../../handler.js';

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
  // Replay-only posture: no generation, no fingerprint management.
  locked?: boolean;
  getScope?: (req: TReq) => Promise<ScopeValues> | ScopeValues;
};

// Fingerprints may contain '/' (named slots like "deals/table"), so
// management rides the request BODY, not the path.
const fingerprintFromBody = (body: unknown): string | undefined => {
  if (body === null || typeof body !== 'object') return undefined;
  const fp = (body as Record<string, unknown>)['fingerprint'];
  return typeof fp === 'string' && fp.length > 0 ? fp : undefined;
};

export const vex = <TReq extends VexExpressRequest = VexExpressRequest>(
  config: VexExpressConfig<TReq>,
): ((req: TReq, res: VexExpressResponse) => Promise<void>) => {
  const handlerConfig = {
    engine: config.engine,
    entities: config.entities,
    ...(config.locked === true ? { locked: true } : {}),
  };

  return async (req: TReq, res: VexExpressResponse): Promise<void> => {
    if (req.method === 'GET') {
      res.json(await handleDiscovery(handlerConfig));
      return;
    }

    if (req.method === 'POST') {
      const scope = config.getScope ? await config.getScope(req) : {};
      const result = await handleQuery(handlerConfig, req.body, scope);
      res.status(result.status).json(result.body);
      return;
    }

    if (req.method === 'PATCH') {
      const fingerprint = fingerprintFromBody(req.body);
      if (fingerprint === undefined) {
        res.status(400).json({ error: 'invalid_request', message: 'Body must include { fingerprint }' });
        return;
      }
      const wanted = (req.body as Record<string, unknown>)['protected'];
      const result = await handleFingerprintPatch(handlerConfig, fingerprint, {
        ...(typeof wanted === 'boolean' ? { protected: wanted } : {}),
      });
      res.status(result.status).json(result.body);
      return;
    }

    if (req.method === 'DELETE') {
      const fingerprint = fingerprintFromBody(req.body);
      if (fingerprint === undefined) {
        res.status(400).json({ error: 'invalid_request', message: 'Body must include { fingerprint }' });
        return;
      }
      const result = await handleFingerprintDelete(handlerConfig, fingerprint);
      res.status(result.status).json(result.body);
      return;
    }

    res.status(405).json({
      error: 'method_not_allowed',
      message: 'GET discovery · POST query · PATCH/DELETE fingerprint management',
    });
  };
};
