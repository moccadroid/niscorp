import type { DatabaseAdapter, AdapterCapabilities, CompiledQuery, BoundParams, Row, IntrospectOptions } from '../adapter.types.js';
import type { DatabaseSchema } from '../../schemas/database.schema.js';
import type { ResolvedQuery } from '../../engine/engine.types.js';
import { introspectPostgres } from './introspect.js';
import type { PgPool } from './introspect.js';
import { compileQuery } from './compile.js';
import { enforcementFor, type TimeoutEnforcement } from './statement-timeout.js';

export type PostgresAdapterConfig = {
  pool: PgPool;
  schema?: string;
  exclude?: string[];
};

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
    fuzzyMatch: false, // needs the pg_trgm extension, which may not be installed
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

  let perStatementMs: number | undefined;
  const limitReads = async (ms: number): Promise<TimeoutEnforcement> => {
    perStatementMs = undefined;
    if (ms <= 0) return 'unenforced';
    const enforcement = await enforcementFor(pool, ms);
    if (enforcement === 'statement') perStatementMs = Math.round(ms);
    return enforcement;
  };

  const execute = async (query: CompiledQuery, params: BoundParams): Promise<Row[]> => {
    const limit = perStatementMs;
    // `transaction` is called on the pool, never taken off it: a driver's own
    // object (a PGlite) has it as a method that needs its receiver.
    const result =
      limit === undefined || pool.transaction === undefined
        ? await pool.query(query.sql, params)
        : await pool.transaction(async (tx) => {
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
