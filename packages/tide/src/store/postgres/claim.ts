import type { ClaimSpec, TableName, TideStore } from '../../types';
import { compileOrder, compileSet, compileWhere, sortRows } from './compile';
import type { Fields } from './compile';
import type { Atomically, Client } from './pool';
import { SQL_TABLE, rowToEntity, snake } from './rows';

// What a claim runs on: what its statements are sent on, how several land as
// one, and the tables being there.
type ClaimParts = { client: Client; atomically: Atomically; ready: Promise<void> };

// Selection and mutation in ONE statement. `FOR UPDATE SKIP LOCKED`
// makes N instances ticking at once ordinary contention rather than a
// lock service — it is a throughput choice; the exactly-once promise is
// the single statement.
export const claimOver =
  ({ client, atomically, ready }: ClaimParts): TideStore['claim'] =>
  async <T extends TableName>(spec: ClaimSpec<T>) => {
    await ready;
    const table = SQL_TABLE[spec.table];
    const order = compileOrder(spec.order, 'c');

    // Selection and mutation in ONE statement, which is the promise.
    // `FOR UPDATE SKIP LOCKED` makes N instances ticking at once ordinary
    // contention rather than a lock service — a throughput choice; the
    // exactly-once part is that it is one statement.
    const take = async (db: Client, extra: Fields, limit: number) => {
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
      // RE-SORTED, and this is not belt-and-braces. `ORDER BY` inside the
      // subquery decides WHICH rows are taken; it says nothing about the
      // order `RETURNING` hands them back, which is the order the UPDATE
      // happened to scan in. The engine executes tasks in the order a claim
      // returns them, so without this a fan-out ran in heap order here and
      // insertion order in memory — two stores, two answers, and a headless
      // check that cannot assert on either.
      return sortRows(result.rows.map((row) => rowToEntity(spec.table, row)), spec.order);
    };

    if (spec.onePer === undefined) return take(client, {}, spec.limit);

    // `order: 'serial'` — at most one held row per group, counting what
    // an earlier claim already holds.
    //
    // A window function would say this in one statement, and Postgres
    // refuses to combine one with `FOR UPDATE`. So the restricted groups
    // are claimed one at a time — there are as many of those as there are
    // serial reflexes, which is a handful — and everything else is taken
    // in the single bulk statement above.
    //
    // ONE AT A TIME, AND ONE INSTANCE AT A TIME. Asking whether a group is
    // held and then claiming in it are two statements, and another
    // instance's two could run between them: both were told nothing was
    // held, and each took a row. So the pair runs in a transaction, behind
    // an advisory lock on the group that ends with it. Whoever does not
    // get the lock leaves the group to whoever has it, as SKIP LOCKED
    // leaves a row: nothing waits. Whoever gets it next asks after the
    // other's claim is committed, and is told the group is held. A
    // transaction alone would not do it: under READ COMMITTED both would
    // still be told nothing was held.
    const { column, held, only } = spec.onePer;
    const restricted = [...only];
    // Room is RESERVED for the serial groups before the bulk claim runs.
    // Taking the full limit first and topping up afterwards is how a busy
    // parallel reflex starves every serial one — the mirror of the defect
    // where a serial reflex with five thousand due tasks starved
    // everybody else because LIMIT was applied before the serial filter.
    const claimed = await take(client, { [column]: { notIn: restricted } }, spec.limit - restricted.length);

    const takeOneOf = (group: string) =>
      atomically(async (tx) => {
        const lock = await tx.query('SELECT pg_try_advisory_xact_lock(hashtext($1), hashtext($2)) AS free', [`tide:${table}.${snake(column)}`, group]);
        if (lock.rows[0]?.['free'] !== true) return [];
        const busy = compileWhere({ ...held, [column]: group }, 1, 'c');
        const taken = await tx.query(`SELECT c.id FROM ${table} c WHERE ${busy.sql} LIMIT 1`, busy.params);
        if (taken.rows.length > 0) return [];
        return take(tx, { [column]: group }, 1);
      });

    for (const group of restricted) {
      if (claimed.length >= spec.limit) break;
      claimed.push(...(await takeOneOf(group)));
    }

    return claimed;
  };
