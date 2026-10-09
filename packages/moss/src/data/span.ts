import type { ExecuteRecord } from '@niscorp/vex';
import type { TelemetrySpan } from '../runtime';

// A vex execution record → a telemetry span. The one place a vex fact becomes
// a span: vex reports in its own vocabulary (handler.ts, ExecuteRecord) and
// knows nothing of OTLP; moss decides what of it is safe to name. Principal
// PRESENCE is derived from the composed scope's `userId` (moss's own
// convention — machinery carries none), never the value itself; no other scope
// value crosses into the span.
export const vexRecordToSpan = (rec: ExecuteRecord): TelemetrySpan => ({
  name: 'vex.execute',
  startUnixNano: rec.startUnixNano,
  endUnixNano: rec.endUnixNano,
  status: rec.status,
  attributes: {
    op: rec.kind,
    hasPrincipal: (rec.scope['userId'] ?? 'anonymous') !== 'anonymous',
    ...(rec.fingerprint !== undefined ? { fingerprint: rec.fingerprint } : {}),
    ...(rec.reach !== undefined ? { reach: rec.reach } : {}),
    ...(rec.cacheHit !== undefined ? { cache: rec.cacheHit ? 'hit' : 'miss' } : {}),
    ...(rec.rows !== undefined ? { rows: rec.rows } : {}),
  },
});
