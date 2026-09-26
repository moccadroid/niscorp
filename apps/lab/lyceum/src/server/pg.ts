import pg from 'pg';
import type { PgPool } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// A `pg` Pool, in the shape vex and moss take — the deployment's sibling of
// `@niscorp/vex/pglite`. Lyceum's own for now; the next app on Postgres is
// the moment it earns a place in vex.
//
// Two decisions carried over from the PGlite shim:
//
//   · DATES. `pg` parses DATE and TIMESTAMPTZ into JS `Date`s, which stringify
//     to locale noise and which Prism's `$date` cannot read — so app reads get
//     the raw wire strings. The vex cache keeps `Date`s: it calls getTime() on
//     its own timestamps. Two wrappers over ONE pool, differing only in the
//     parsers each query is run with.
//
//   · TRANSACTIONS. A batch mutation must land on one connection or not at
//     all, so `transaction` checks a client out, runs BEGIN … COMMIT on it, and
//     rolls back on a throw. Wrapping BEGIN/COMMIT over `pool.query` would send
//     the statements to whichever connections were free.
// ═══════════════════════════════════════════════════════════════

type Parsers = Record<number, (value: string) => unknown>;

const RAW = (value: string): string => value;

// DATE (OID 1082) and TIMESTAMPTZ (1184) come back as the wire's own strings.
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
