import type { Context, Next } from 'hono';
import type { MutationClient, PgPool, CacheBackend, QueryEngineConfig } from '@niscorp/vex';
import type { Sequence } from '@niscorp/strata';
import type { Telemetry } from './telemetry';
import type { Fabric } from './fabric';

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
