import type { DatabaseAdapter, AdapterCapabilities, CompiledQuery, BoundParams, Row, IntrospectOptions } from '../adapter.types.js';
import type { DatabaseSchema } from '../../schemas/database.schema.js';
import type { ResolvedQuery } from '../../engine/engine.types.js';
import { introspectPostgres } from './introspect.js';
import type { PgPool } from './introspect.js';
import { compileQuery } from './compile.js';

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════

export type PostgresAdapterConfig = {
  pool: PgPool;
  schema?: string;
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
  const { pool, schema = 'public' } = config;

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
    introspectPostgres(pool, { ...options, schema: options?.schema ?? schema });

  const compile = (resolved: ResolvedQuery): CompiledQuery =>
    compileQuery(resolved);

  const execute = async (query: CompiledQuery, params: BoundParams): Promise<Row[]> => {
    const result = await pool.query(query.sql, params);
    return coerceNumericColumns(result.rows, result.fields as PgField[]);
  };

  return {
    id: 'postgres',
    introspect,
    compile,
    execute,
    capabilities,
  };
};
