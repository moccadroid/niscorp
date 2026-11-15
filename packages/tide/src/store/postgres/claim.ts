import { PRIMARY_KEY } from '../../types';
import type { ClaimSpec, TableName, TideStore } from '../../types';
import { compileOrder, compileSet, compileWhere, sortRows } from './compile';
import type { Fields } from './compile';
import type { Atomically, Client } from './pool';
import { SQL_TABLE, rowToEntity, snake } from './rows';

type ClaimParts = { client: Client; atomically: Atomically; ready: Promise<void> };

export const claimOver =
  ({ client, atomically, ready }: ClaimParts): TideStore['claim'] =>
  async <T extends TableName>(spec: ClaimSpec<T>) => {
    await ready;
    const table = SQL_TABLE[spec.table];
    const order = compileOrder(spec.order, 'c');

    const take =async (db: Client, extra: Fields, limit: number) => {
      if (limit <= 0) return [];
      const where = compileWhere({ ...spec.where, ...extra }, 1, 'c');
      const set = compileSet(spec.set, where.params.length + 1);
      const result = await db.query(
        `UPDATE ${table} SET ${set.sql}
         WHERE ctid IN (
           SELECT c.ctid FROM ${table} c WHERE ${where.sql}${order}
           LIMIT ${Math.floor(limit)} FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
        [...where.params, ...set.params],
      );
      // ORDER BY inside the subquery decides which rows are taken, not the order RETURNING hands them
      // back, and the engine runs tasks in the order a claim returns them.
      return sortRows(result.rows.map((row) => rowToEntity(spec.table, row)), spec.order);
    };

    if (spec.onePer === undefined) return take(client, {}, spec.limit);

    // What the claim may take, in order: every row outside `only`, and the first row of each group in
    // `only` where no earlier claim is still running. Postgres refuses a window function beside FOR UPDATE,
    // so these rows are read first and claimed after, the groups in `only` one at a time. Asking whether a
    // group is busy and then claiming in it are two statements: they run in a transaction behind an
    // advisory lock on the group, because under READ COMMITTED two instances would both be told it is free.
    const { column, held, only } = spec.onePer;
    const key = snake(PRIMARY_KEY[spec.table]);
    const where = compileWhere(spec.where, 1, 'c');
    const running = compileWhere(held, where.params.length + 1, 'h');
    const candidates = await client.query(
      `SELECT e.${key} AS key, e.${snake(column)} AS grp FROM (
         SELECT c.*, row_number() OVER (PARTITION BY c.${snake(column)}${order}) AS nth FROM ${table} c WHERE ${where.sql}
       ) e
       WHERE NOT (e.${snake(column)} = ANY($${where.params.length + running.params.length + 1}))
          OR (e.nth = 1 AND NOT EXISTS (SELECT 1 FROM ${table} h WHERE ${running.sql} AND h.${snake(column)} = e.${snake(column)}))
       ${compileOrder(spec.order, 'e')} LIMIT ${Math.floor(spec.limit)}`,
      [...where.params, ...running.params, [...only]],
    );
    const restricted = new Set<unknown>(only);
    const free = candidates.rows.filter((row) => !restricted.has(row['grp'])).map((row) => row['key']);
    const firsts = candidates.rows.filter((row) => restricted.has(row['grp'])).map((row) => String(row['grp']));
    const claimed = await take(client, { [PRIMARY_KEY[spec.table]]: { in: free } }, free.length);

    const takeOneOf = (group: string) =>
      atomically(async (tx) => {
        const lock = await tx.query('SELECT pg_try_advisory_xact_lock(hashtext($1), hashtext($2)) AS free', [`tide:${table}.${snake(column)}`, group]);
        if (lock.rows[0]?.['free'] !== true) return [];
        const busy = compileWhere({ ...held, [column]: group }, 1, 'c');
        const taken = await tx.query(`SELECT c.id FROM ${table} c WHERE ${busy.sql} LIMIT 1`, busy.params);
        if (taken.rows.length > 0) return [];
        return take(tx, { [column]: group }, 1);
      });

    for (const group of firsts) claimed.push(...(await takeOneOf(group)));

    return sortRows(claimed, spec.order);
  };
