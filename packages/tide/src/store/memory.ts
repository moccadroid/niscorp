import { COMPARISON_OPS, PRIMARY_KEY, UNIQUE_BY } from '../types';
import type {
  ClaimSpec,
  Comparison,
  Fact,
  Mutation,
  Order,
  QuerySpec,
  ReflexState,
  RemoveSpec,
  Row,
  Run,
  TableName,
  Task,
  TideStore,
  TideTables,
  Where,
} from '../types';

// ═══════════════════════════════════════════════════════════════
// The memory store
//
// The reference implementation of TideStore, and the definition of
// the contract: four tables, six operations, and no knowledge of
// what a reflex, a retry or an occurrence is. It went from 414
// lines to this by losing the twenty-seven nouns — `claimTasks`,
// `drainSettled` and `claimClosedWindows` were three hand-written
// implementations of one operation, and they diverged three ways.
//
// Its exactly-once promises are free in a single-threaded runtime,
// which is exactly why every store must be held to the SAME contract
// tests. A store that lies passes checks that then fail in
// production — see `test/store.contract.ts`.
// ═══════════════════════════════════════════════════════════════

export type MemoryStore = TideStore & {
  // Test/inspection affordance. Never part of TideStore — the engine must
  // not be able to reach around the contract.
  snapshot: () => { facts: readonly Fact[]; runs: readonly Run[]; tasks: readonly Task[]; state: readonly ReflexState[] };
};

const ID_PREFIX: Record<TableName, string> = { fact: 'fact', run: 'run', task: 'task', state: 'st' };

const isComparison = (value: unknown): value is Comparison<unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => (COMPARISON_OPS as readonly string[]).includes(key));
};

const compare = (left: unknown, right: unknown): number => {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
};

const satisfies = (value: unknown, test: unknown): boolean => {
  if (!isComparison(test)) return value === test;
  const check = test;
  if (check.eq !== undefined && value !== check.eq) return false;
  if (check.ne !== undefined && value === check.ne) return false;
  if (check.lt !== undefined && !(value !== undefined && compare(value, check.lt) < 0)) return false;
  if (check.lte !== undefined && !(value !== undefined && compare(value, check.lte) <= 0)) return false;
  if (check.gt !== undefined && !(value !== undefined && compare(value, check.gt) > 0)) return false;
  if (check.gte !== undefined && !(value !== undefined && compare(value, check.gte) >= 0)) return false;
  if (check.in !== undefined && !check.in.includes(value as never)) return false;
  if (check.notIn !== undefined && check.notIn.includes(value as never)) return false;
  if (check.isNull !== undefined && (value === undefined || value === null) !== check.isNull) return false;
  return true;
};

const matches = (row: Row, where: Where<Row> | undefined): boolean => {
  if (where === undefined) return true;
  for (const [column, test] of Object.entries(where)) if (!satisfies(row[column], test)) return false;
  return true;
};

const sorted = <R extends Row>(rows: readonly R[], order: Order<Row> | undefined): R[] => {
  if (order === undefined || order.length === 0) return [...rows];
  return [...rows].sort((left, right) => {
    for (const key of order) {
      const result = compare(left[key.by], right[key.by]) * (key.dir === 'desc' ? -1 : 1);
      if (result !== 0) return result;
    }
    return 0;
  });
};

// The one arithmetic escape. `attempt` has to rise at claim time, and a
// caller that read it first would race its own increment.
const applied = <R extends Row>(row: R, set: Mutation<R>): R => {
  const next: Row = { ...row };
  for (const [column, value] of Object.entries(set)) {
    if (value !== null && typeof value === 'object' && 'inc' in value) {
      next[column] = Number(row[column] ?? 0) + Number((value as { inc: number }).inc);
      continue;
    }
    // `undefined` CLEARS. A settled task has no token and no lease, and
    // "leave it as it was" is never what the engine means by writing one.
    if (value === undefined) delete next[column];
    else next[column] = value;
  }
  return next as R;
};

export const createMemoryStore = (): MemoryStore => {
  let tables: { [T in TableName]: Map<string, TideTables[T]> } = {
    fact: new Map(),
    run: new Map(),
    task: new Map(),
    state: new Map(),
  };

  let sequence = 0;

  const rowsOf = <T extends TableName>(table: T): TideTables[T][] => [...tables[table].values()];
  const keyOf = <T extends TableName>(table: T, row: TideTables[T]): string => String(row[PRIMARY_KEY[table]]);

  // ── the six ────────────────────────────────────────────────────

  const query = async <T extends TableName>(spec: QuerySpec<T>): Promise<readonly TideTables[T][]> => {
    const found = sorted(
      rowsOf(spec.table).filter((row) => matches(row as Row, spec.where as Where<Row> | undefined)),
      spec.order as unknown as Order<Row> | undefined,
    ) as TideTables[T][];
    return spec.limit === undefined ? found : found.slice(0, spec.limit);
  };

  const appendIfAbsent = async <T extends TableName>(
    table: T,
    input: Omit<TideTables[T], 'id'> & { id?: string },
  ): Promise<TideTables[T] | undefined> => {
    const unique = UNIQUE_BY[table];
    const candidate = input as unknown as Row;

    // A row that does not carry the guard column is not claiming to be
    // unique — a fact with no `dedupeKey` is a distinct occurrence of
    // something, not a repeat of it.
    const guarded = unique.when === undefined || candidate[unique.when] !== undefined;
    if (guarded) {
      const collides = rowsOf(table).some((existing) =>
        unique.by.every((column) => (existing as unknown as Row)[column] === candidate[column]),
      );
      if (collides) return undefined;
    }

    sequence += 1;
    // An id is minted only where the primary key IS `id`. `state` is keyed by
    // the reflex it belongs to, and giving it a second identity would invent
    // a way for one reflex to have two states.
    const row = (PRIMARY_KEY[table] === 'id' ? { ...candidate, id: candidate.id ?? `${ID_PREFIX[table]}_${sequence}` } : { ...candidate }) as TideTables[T];
    tables[table].set(keyOf(table, row), row);
    return row;
  };

  const claim = async <T extends TableName>(spec: ClaimSpec<T>): Promise<readonly TideTables[T][]> => {
    const candidates = sorted(
      rowsOf(spec.table).filter((row) => matches(row as Row, spec.where as Where<Row> | undefined)),
      spec.order as unknown as Order<Row> | undefined,
    ) as TideTables[T][];

    // Values whose one slot is already held. Counted HERE, inside the claim,
    // rather than by the caller beforehand — a caller that looks first and
    // claims second loses the race to its own second instance.
    const taken = new Set<string>();
    const restricted = new Set(spec.onePer?.only ?? []);
    if (spec.onePer !== undefined)
      for (const row of rowsOf(spec.table))
        if (matches(row as Row, spec.onePer.held as Where<Row>)) taken.add(String((row as Row)[spec.onePer.column]));

    const claimed: TideTables[T][] = [];
    for (const row of candidates) {
      if (claimed.length >= spec.limit) break;
      if (spec.onePer !== undefined) {
        const group = String((row as Row)[spec.onePer.column]);
        if (restricted.has(group)) {
          if (taken.has(group)) continue;
          taken.add(group);
        }
      }
      const next = applied(row as Row, spec.set as Mutation<Row>) as TideTables[T];
      tables[spec.table].set(keyOf(spec.table, next), next);
      claimed.push(next);
    }
    return claimed;
  };

  const cas = async <T extends TableName>(
    table: T,
    id: string,
    expect: Where<TideTables[T]>,
    set: Mutation<TideTables[T]>,
  ): Promise<boolean> => {
    const row = tables[table].get(id);
    if (row === undefined || !matches(row as Row, expect as Where<Row>)) return false;
    tables[table].set(id, applied(row as Row, set as Mutation<Row>) as TideTables[T]);
    return true;
  };

  const remove = async <T extends TableName>(spec: RemoveSpec<T>): Promise<number> => {
    const doomed = rowsOf(spec.table).filter((row) => matches(row as Row, spec.where as Where<Row> | undefined));
    for (const row of doomed) {
      tables[spec.table].delete(keyOf(spec.table, row));
      // A run and its tasks are one fact about the world. Deleting the run
      // and keeping the tasks destroys the UNIQUE(runId, unit) entry that IS
      // the "this unit already ran" record — and a restore then re-charges
      // the invoice.
      if (spec.table === 'run')
        for (const task of rowsOf('task')) if (task.runId === (row as unknown as Run).id) tables.task.delete(task.id);
    }
    return doomed.length;
  };

  // Copy-on-enter, restore-on-throw. Trivial here and not a formality: the
  // contract test asserts a throwing transaction leaves nothing behind, and
  // a store that cannot promise that breaks fan-out's whole argument.
  const transact = async <T>(fn: (tx: TideStore) => Promise<T>): Promise<T> => {
    const saved = { fact: new Map(tables.fact), run: new Map(tables.run), task: new Map(tables.task), state: new Map(tables.state) };
    try {
      return await fn(store);
    } catch (error) {
      tables = saved;
      throw error;
    }
  };

  const store: MemoryStore = {
    transact,
    appendIfAbsent,
    claim,
    cas,
    query,
    remove,
    snapshot: () => ({ facts: rowsOf('fact'), runs: rowsOf('run'), tasks: rowsOf('task'), state: rowsOf('state') }),
  };

  return store;
};
