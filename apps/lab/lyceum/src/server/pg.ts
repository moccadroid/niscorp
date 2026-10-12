import pg from 'pg';
import type { PgPool } from '@niscorp/vex';

// `pg` parses DATE and TIMESTAMPTZ into `Date`s, which Prism's `$date` cannot
// read, so app reads get the raw wire strings. The vex cache keeps `Date`s: it
// calls getTime() on its own timestamps.
type Parsers = Record<number, (value: string) => unknown>;

const RAW = (value: string): string => value;

export const RAW_DATE_PARSERS: Parsers = { 1082: RAW, 1184: RAW };

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

const queryWith = (target: Queryable, parsers: Parsers | undefined): PgPool['query'] => {
  const types =
    parsers === undefined
      ? undefined
      : {
          getTypeParser: (oid: number, format?: 'text' | 'binary') => parsers[oid] ?? pg.types.getTypeParser(oid, format),
        };
  return async (text, values) => {
    const result = await target.query({ text, ...(values === undefined ? {} : { values }), ...(types === undefined ? {} : { types }) });
    return { rows: result.rows, fields: result.fields.map((field) => ({ name: field.name, dataTypeID: field.dataTypeID })) };
  };
};

export const createPgPool = (pool: pg.Pool, parsers?: Parsers): PgPool => ({
  query: queryWith(pool, parsers),
  transaction: async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({ query: queryWith(client, parsers) });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
});
