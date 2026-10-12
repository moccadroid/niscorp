import { migrate as migrateLedger } from '@niscorp/strata/postgres';
import { PRIMARY_KEY, UNIQUE_BY } from '../../types';
import type { Mutation, QuerySpec, RemoveSpec, TableName, TideStore, TideTables, Where } from '../../types';
import { claimOver } from './claim';
import { compileOrder, compileSet, compileWhere } from './compile';
import type { Fields } from './compile';
import type { Atomically, Client, TidePool } from './pool';
import { SQL_TABLE, rowToEntity, snake, toColumn } from './rows';
import { TIDE_SEQUENCE } from './tables';

const mintId = ((): ((table: TableName) => string) => {
  let sequence = 0;
  return (table) => {
    sequence += 1;
    return `${table}_${Date.now().toString(36)}_${sequence.toString(36)}`;
  };
})();

export type TideStoreOptions = {
  migrate?: boolean;
};

export const createTideStore = (pool: TidePool, options: TideStoreOptions = {}): TideStore & { ready: Promise<void> } => {
  // Every method awaits this: one that did not would race the DDL and throw `42P01 undefined_table`.
  const ready: Promise<void> = options.migrate === false ? Promise.resolve() : migrateLedger(pool, [TIDE_SEQUENCE]).then(() => undefined);
  // An unhandled rejection is process-fatal on Node ≥ 15. Every method that
  // awaits `ready` still rejects with it.
  ready.catch(() => undefined);

  const overPool: Atomically = (fn) => {
    if (pool.transaction === undefined)
      throw new Error('tide store: this pool cannot transact — fan-out, attempt recording and a serial claim are transactions, not conventions');
    return pool.transaction(fn);
  };

  const build = (client: Client, atomically: Atomically): TideStore => {
    const store: TideStore = {
      query: async <T extends TableName>(spec: QuerySpec<T>) => {
        await ready;
        const where = compileWhere(spec.where, 1);
        const limit = spec.limit === undefined ? '' : ` LIMIT ${Math.max(0, Math.floor(spec.limit))}`;
        const result = await client.query(
          `SELECT * FROM ${SQL_TABLE[spec.table]} WHERE ${where.sql}${compileOrder(spec.order)}${limit}`,
          where.params,
        );
        return result.rows.map((row) => rowToEntity(spec.table, row));
      },

      appendIfAbsent: async <T extends TableName>(table: T, input: Omit<TideTables[T], 'id'> & { id?: string }) => {
        await ready;
        const given: Fields = input;
        const withId: Fields = PRIMARY_KEY[table] === 'id' ? { ...given, id: input.id ?? mintId(table) } : given;
        const entries = Object.entries(withId).filter(([, value]) => value !== undefined);
        const columns = entries.map(([field]) => snake(field));
        const params = entries.map(([field, value]) => toColumn(snake(field), value));

        const unique = UNIQUE_BY[table];
        const target =
          unique.when === undefined
            ? `(${unique.by.map((column) => snake(column)).join(', ')})`
            : `(${unique.by.map((column) => (column === 'entity' || column === 'name' ? `coalesce(${snake(column)},'')` : snake(column))).join(', ')}) WHERE ${snake(unique.when)} IS NOT NULL`;

        const result = await client.query(
          `INSERT INTO ${SQL_TABLE[table]} (${columns.join(', ')}) VALUES (${params.map((_value, index) => `$${index + 1}`).join(', ')})
           ON CONFLICT ${target} DO NOTHING RETURNING *`,
          params,
        );
        const row = result.rows[0];
        return row === undefined ? undefined : rowToEntity(table, row);
      },

      claim: claimOver({ client, atomically, ready }),

      cas: async <T extends TableName>(table: T, id: string, expect: Where<TideTables[T]>, set: Mutation<TideTables[T]>) => {
        await ready;
        const key = snake(PRIMARY_KEY[table]);
        const where = compileWhere(expect, 2);
        const patch = compileSet(set, where.params.length + 2);
        const result = await client.query(
          `UPDATE ${SQL_TABLE[table]} SET ${patch.sql} WHERE ${key} = $1 AND ${where.sql} RETURNING ${key}`,
          [id, ...where.params, ...patch.params],
        );
        return result.rows.length > 0;
      },

      remove: async <T extends TableName>(spec: RemoveSpec<T>) => {
        await ready;
        const where = compileWhere(spec.where, 1);
        // A run's work goes with it through the foreign key (ON DELETE CASCADE).
        const result = await client.query(`DELETE FROM ${SQL_TABLE[spec.table]} WHERE ${where.sql} RETURNING ${snake(PRIMARY_KEY[spec.table])}`, where.params);
        return result.rows.length;
      },

      transact: async <T>(fn: (tx: TideStore) => Promise<T>): Promise<T> => {
        await ready;
        return atomically((tx) => fn(build(tx, (inner) => inner(tx))));
      },
    };
    return store;
  };

  return { ...build(pool, overPool), ready };
};
