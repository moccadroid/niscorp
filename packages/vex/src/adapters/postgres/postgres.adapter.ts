import type { DatabaseAdapter, AdapterCapabilities, CompiledQuery, BoundParams, Row, IntrospectOptions } from '../adapter.types.js';
import type { DatabaseSchema } from '../../schemas/database.schema.js';
import type { ResolvedQuery } from '../../engine/engine.types.js';
import { introspectPostgres } from './introspect.js';
import type { PgPool } from './introspect.js';
import { compileQuery } from './compile.js';
import { enforcementFor, type TimeoutEnforcement } from './statement-timeout.js';

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════

export type PostgresAdapterConfig = {
  pool: PgPool;
  schema?: string;
  // Tables this adapter never reports. Set once at construction because the
  // caller that knows a table is not application data is the one wiring the
  // adapter, not each caller of `introspect()` — and `QueryEngine.introspect`
  // takes no arguments, so per-call is not reachable from a host anyway.
  exclude?: string[];
};

// ═══════════════════════════════════════════════════════════════
// Adapter factory
// ═══════════════════════════════════════════════════════════════

const NUMERIC_OIDS = new Set([
  20,    // int8
  700,   // float4
  701,   // float8
  1700,  // numeric
]);

type PgField = { name: string; dataTypeID: number };

const coerceNumericColumns = (rows: Row[], fields: PgField[]): Row[] => {
  const numericKeys = fields
    .filter(f => NUMERIC_OIDS.has(f.dataTypeID))
    .map(f => f.name);
  if (numericKeys.length === 0 || rows.length === 0) return rows;
  return rows.map(row => {
    const out = { ...row };
    for (const key of numericKeys) {
      const v = out[key];
      if (typeof v === 'string') {
        const n = Number(v);
        if (Number.isFinite(n)) out[key] = n;
      }
    }
    return out;
  });
};

export const createPostgresAdapter = (config: PostgresAdapterConfig): DatabaseAdapter => {
  const { pool, schema = 'public', exclude } = config;

  const capabilities: AdapterCapabilities = {
    vectorSearch: true,
    fuzzyMatch: false, // Requires pg_trgm extension, not guaranteed
    jsonFields: true,
    fullTextSearch: true,
    returningClause: true,
    cte: true,
    windowFunctions: true,
    statementTimeout: true,
  };

  const introspect = async (options?: IntrospectOptions): Promise<DatabaseSchema> =>
    introspectPostgres(pool, {
      ...options,
      schema: options?.schema ?? schema,
      exclude: options?.exclude ?? exclude,
    });

  const compile = (resolved: ResolvedQuery): CompiledQuery =>
    compileQuery(resolved);

  // How reads are bounded (./statement-timeout.ts): unbounded until the
  // engine asks; then plain when the connection already enforces the limit,
  // wrapped per statement when it does not.
  let perStatementMs: number | undefined;
  const limitReads = async (ms: number): Promise<TimeoutEnforcement> => {
    perStatementMs = undefined;
    if (ms <= 0) return 'unenforced';
    const enforcement = await enforcementFor(pool, ms);
    if (enforcement === 'statement') perStatementMs = Math.round(ms);
    return enforcement;
  };

  const execute = async (query: CompiledQuery, params: BoundParams): Promise<Row[]> => {
    const { transaction } = pool;
    const limit = perStatementMs;
    const result =
      limit === undefined || transaction === undefined
        ? await pool.query(query.sql, params)
        : await transaction(async (tx) => {
            // SET cannot take a bind parameter; the limit is an integer the
            // engine configured, never request data.
            await tx.query(`SET LOCAL statement_timeout = ${limit}`);
            return tx.query(query.sql, params);
          });
    return coerceNumericColumns(result.rows, result.fields as PgField[]);
  };

  return {
    id: 'postgres',
    introspect,
    compile,
    execute,
    capabilities,
    limitReads,
  };
};
