import type { Context, Next } from 'hono';
import type { CacheBackend, MutationClient, PgPool, QueryEngineConfig } from '@niscorp/vex';
import type { Sequence } from '@niscorp/strata';
import { z } from 'zod';

export type SessionVerifier = (token: string) => string | null | Promise<string | null>;

export type NiscRuntime = {
  pool: PgPool;
  db: MutationClient;
  cache?: CacheBackend;
  vexConfig?: QueryEngineConfig['config'];
  session: SessionVerifier | 'sessions' | 'dev-open';
  origins?: readonly string[];
  migrations?: 'apply' | 'verify';
  tables?: readonly Sequence[];
  shellIdleMs?: number;
  anonymousShellMax?: number;
  endpointTimeoutMs?: number;
  sessionRevalidateMs?: number;
  identityMax?: number;
  identityIdleMs?: number;
  shellFrameDelta?: boolean;
  socketCompression?: boolean | Record<string, unknown>;
  socketMaxMessageBytes?: number;
  operatorKey?: string;

  operatorGate?: (c: Context, next: Next) => Response | void | Promise<Response | void>;

  fabric?: Fabric;

  telemetry?: Telemetry;
};

export type TelemetrySpan = {
  name: string;
  // A JS number cannot hold epoch nanoseconds exactly: the loss is far below
  // the milliseconds measured here.
  startUnixNano: number;
  endUnixNano: number;
  status: 'ok' | 'error' | 'refused';
  // Identifiers and measurements only: never a payload, a name, or who a principal is.
  attributes: Record<string, string | number | boolean>;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
};

export type Telemetry = {
  emit: (span: TelemetrySpan) => void;
};

export type Emit = (span: TelemetrySpan) => void;

export const emitterOf = (telemetry: Telemetry | undefined): Emit | undefined =>
  telemetry === undefined
    ? undefined
    : (span) => {
        try {
          telemetry.emit(span);
        } catch (err) {
          console.error('[moss:telemetry]', err);
        }
      };

export type SpanClock = { startUnixNano: number; endUnixNano: () => number };

const elapsedClock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const spanClock = (): SpanClock => {
  const startUnixNano = Date.now() * 1e6;
  const t0 = elapsedClock();
  return { startUnixNano, endUnixNano: () => startUnixNano + (elapsedClock() - t0) * 1e6 };
};

const stamp = { origin: z.string() };

export const FabricMessageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('invalidate-identity'), principal: z.string(), ...stamp }),
  z.strictObject({ kind: z.literal('invalidate-tenant'), tag: z.string(), ...stamp }),
  z.strictObject({ kind: z.literal('nudge'), principal: z.string(), channel: z.string(), ...stamp }),
]);

export type FabricMessage = z.infer<typeof FabricMessageSchema>;

type Unstamped<Message> = Message extends unknown ? Omit<Message, 'origin'> : never;
export type FabricSignal = Unstamped<FabricMessage>;

export type Fabric = {
  publish: (message: FabricMessage) => void;
  subscribe: (apply: (message: unknown) => void) => void;
};
