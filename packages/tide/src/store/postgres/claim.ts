import type { ClaimSpec, TableName, TideStore, TideTables } from '../../types';
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

    // Postgres refuses a window function beside FOR UPDATE, so the restricted groups are claimed one
    // at a time. Asking whether a group is held and then claiming in it are two statements: they run
    // in a transaction behind an advisory lock on the group, because under READ COMMITTED two
    // instances would both be told nothing is held.
    const { column, held, only } = spec.onePer;
    const restricted = [...only];

    const takeOneOf = (group: string) =>
      atomically(async (tx) => {
        const lock = await tx.query('SELECT pg_try_advisory_xact_lock(hashtext($1), hashtext($2)) AS free', [`tide:${table}.${snake(column)}`, group]);
        if (lock.rows[0]?.['free'] !== true) return [];
        const busy = compileWhere({ ...held, [column]: group }, 1, 'c');
        const taken = await tx.query(`SELECT c.id FROM ${table} c WHERE ${busy.sql} LIMIT 1`, busy.params);
        if (taken.rows.length > 0) return [];
        return take(tx, { [column]: group }, 1);
      });

    // The serial groups are claimed first, or a busy parallel reflex starves them; what they leave of the
    // limit goes to the other rows, so serial groups with nothing due take no room from them.
    const claimed: TideTables[T][] = [];
    for (const group of restricted) {
      if (claimed.length >= spec.limit) break;
      claimed.push(...(await takeOneOf(group)));
    }
    claimed.push(...(await take(client, { [column]: { notIn: restricted } }, spec.limit - claimed.length)));

    return sortRows(claimed, spec.order);
  };
