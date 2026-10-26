import pg from 'pg';
import type { PgPool, PgQuery } from '../postgres/introspect.js';
import type { TypeParsers } from '../postgres/date-parsers.js';

export { RAW_DATE_PARSERS } from '../postgres/date-parsers.js';

type QueryConfig = {
  text: string;
  values?: unknown[];
  types?: { getTypeParser: (oid: number, format?: 'text' | 'binary') => (value: string) => unknown };
};

type Queryable = {
  query: (config: QueryConfig) => Promise<{ rows: Record<string, unknown>[]; fields: Array<{ name: string; dataTypeID: number }> }>;
};

type NodePostgresPool = Queryable & { connect: () => Promise<Queryable & { release: () => void }> };

const queryOn = (target: Queryable, parsers: TypeParsers | undefined): PgQuery => {
  // A query's own `types` replaces pg's lookup entirely, so every OID the
  // parsers leave out falls back to pg's.
  const types =
    parsers === undefined
      ? undefined
      : { getTypeParser: (oid: number, format?: 'text' | 'binary') => parsers[oid] ?? pg.types.getTypeParser(oid, format) };
  return async (text, values) => {
    const { rows, fields } = await target.query({ text, ...(values === undefined ? {} : { values }), ...(types === undefined ? {} : { types }) });
    return { rows, fields: fields.map(({ name, dataTypeID }) => ({ name, dataTypeID })) };
  };
};

export const createPgPool = (pool: NodePostgresPool, parsers?: TypeParsers): PgPool => ({
  query: queryOn(pool, parsers),
  transaction: async (fn) => {
    const client = await pool.connect();
    try {
      await client.query({ text: 'BEGIN' });
      const result = await fn({ query: queryOn(client, parsers) });
      await client.query({ text: 'COMMIT' });
      return result;
    } catch (error) {
      await client.query({ text: 'ROLLBACK' });
      throw error;
    } finally {
      client.release();
    }
  },
});
