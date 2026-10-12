import type { FactInput, Reflex, ReflexInput } from './schemas';

export type Row = Record<string, unknown>;

export type Fact = FactInput & {
  id: string;
  as?: string;
  depth: number;
  deliveredAt?: number;
  parked?: string;
  released?: boolean;
  root?: string;
  descendants?: number;
};

export type RunState = 'pending' | 'fanned' | 'settled' | 'skipped';

export type Run = {
  id: string;
  reflexId: string;
  version: string;
  as?: string;
  cause: string;
  occurrence?: string;
  factIds?: readonly string[];
  state: RunState;
  depth: number;
  selected?: number;
  total: number;
  done: number;
  failed: number;
  dueAt: number;
  createdAt: number;
  settledAt?: number;
  // Set when no run fact is owed: the settlement has been emitted as one, or
  // the run was skipped. Apart from `settledAt`: a retried task settles its
  // run again, and that must not emit a second fact.
  drained?: boolean;
  note?: string;
};

export type AttemptOutcome = 'ok' | 'error' | 'timeout';

export type TaskState = 'pending' | 'claimed' | 'retrying' | 'done' | 'failed';

export type Task = {
  id: string;
  runId: string;
  reflexId: string;
  unit: string;
  cause: string;
  // Frozen at fan-out: a retry evaluates against the data the selection saw.
  env: Row;
  depth: number;
  state: TaskState;
  attempt: number;
  token?: string;
  // Zero, not null, when unclaimed: "never claimed or lapsed" is then one
  // comparison, in a query grammar that has no OR.
  claimedUntil: number;
  notBefore: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  createdAt: number;
  settledAt?: number;
};

export type ReflexState = {
  reflexId: string;
  armedAt: number;
  materializedThrough?: number;
};

export type TideCtx = {
  reflexId: string;
  runId: string;
  taskId: string;
  // The idempotency key a handler passes to an external provider: the same
  // on every attempt of the task.
  taskKey: string;
  attempt: number;
  depth: number;
  now: number;
  actor: unknown;
  emit: (fact: Omit<FactInput, 'cause'>) => void;
};

export type EffectHandler = {
  run: (input: unknown, ctx: TideCtx) => Promise<unknown> | unknown;
  writes?: readonly string[];
  preview?: (input: unknown, ctx: PreviewCtx) => unknown;
};

export type PreviewCtx = { reflexId: string; unit: string; now: number; actor: unknown };

export type EffectRegistry = Record<string, EffectHandler>;

export type TransformFn = (config: unknown, source: Row) => unknown;

export type SelectFn = (query: unknown, ctx: SelectCtx) => AsyncIterable<Row> | Iterable<Row> | Promise<Iterable<Row>>;

export type SelectCtx = { reflexId: string; now: number; actor: unknown; env: Row };

export type ActorFn = (as: string | undefined) => unknown;

export type Retention = Partial<Record<'facts' | 'runs' | 'tasks', number>>;

export type TideConfig = {
  store: TideStore;
  transform: TransformFn;
  select?: SelectFn;
  effects?: EffectRegistry | ((as: string | undefined) => EffectRegistry);
  actor?: ActorFn;
  maxChainDepth?: number;
  maxChainFacts?: number;
  storeUnwatchedWrites?: boolean;
  maxFanOut?: number;
  leaseMs?: number;
  onEvent?: (event: TideEvent) => void;
};

export type TideEvent =
  | { type: 'run.created'; run: Run }
  | { type: 'run.settled'; run: Run }
  | { type: 'run.skipped'; reflexId: string; reason: string }
  | { type: 'run.deferred'; reflexId: string; runId: string; reason: string }
  | { type: 'task.done'; task: Task }
  | { type: 'task.failed'; task: Task }
  | { type: 'task.retrying'; task: Task; nextAt: number }
  | { type: 'task.reclaimed'; task: Task }
  | { type: 'fact.ingested'; fact: Fact }
  | { type: 'fact.deduped'; fact: NewFact }
  | { type: 'fact.parked'; fact: Fact; reason: string }
  | { type: 'fact.unmatched'; fact: Fact; reflexId: string; reason: string };

export type AdvanceReport = {
  now: number;
  materialized: number;
  skippedOccurrences: number;
  factsMatched: number;
  runsCreated: number;
  tasksCreated: number;
  executed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  reclaimed: number;
  runsSettled: number;
  parked: number;
};

export type LoadReport = {
  loaded: number;
  cycles: readonly { reflexIds: readonly string[]; guarded: boolean }[];
  blind: readonly { reflexId: string; effect: string }[];
  warnings: readonly string[];
};

export type PreviewUnit = {
  unit: string;
  env: Row;
  input?: unknown;
  render?: unknown;
  error?: string;
};

export type PreviewReport = {
  reflexId: string;
  version: string;
  fired: boolean;
  reason?: string;
  cause?: string;
  occurrence?: string;
  effect: string;
  selected: number;
  units: readonly PreviewUnit[];
};

export type NewFact = FactInput & { depth: number; as?: string };

export type TideTables = {
  fact: Fact;
  run: Run;
  task: Task;
  state: ReflexState;
};

export type TableName = keyof TideTables;

export const PRIMARY_KEY: { [T in TableName]: keyof TideTables[T] & string } = {
  fact: 'id',
  run: 'id',
  task: 'id',
  state: 'reflexId',
};

export type UniqueKey<T extends TableName> = {
  by: readonly (keyof TideTables[T] & string)[];
  // The key applies only to rows that have this column set: in Postgres, a
  // partial unique index.
  when?: keyof TideTables[T] & string;
};

export const UNIQUE_BY: { [T in TableName]: UniqueKey<T> } = {
  // `entity` is in the key: two polls over different tables can agree on a cursor value.
  fact: { by: ['kind', 'entity', 'name', 'dedupeKey'], when: 'dedupeKey' },
  run: { by: ['reflexId', 'cause'] },
  task: { by: ['runId', 'unit'] },
  state: { by: ['reflexId'] },
};

export type Comparison<V> = {
  eq?: V;
  ne?: V;
  lt?: V;
  lte?: V;
  gt?: V;
  gte?: V;
  in?: readonly V[];
  notIn?: readonly V[];
  isNull?: boolean;
};

export const COMPARISON_OPS = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in', 'notIn', 'isNull'] as const;

export type Where<R> = { [K in keyof R]?: R[K] | Comparison<R[K]> };

export type Order<R> = readonly { by: keyof R & string; dir?: 'asc' | 'desc' }[];

export type QuerySpec<T extends TableName = TableName> = {
  table: T;
  where?: Where<TideTables[T]>;
  order?: Order<TideTables[T]>;
  limit?: number;
};

export type Mutation<R> = { [K in keyof R]?: R[K] | { inc: number } };

export type ClaimSpec<T extends TableName = TableName> = {
  table: T;
  where?: Where<TideTables[T]>;
  order?: Order<TideTables[T]>;
  limit: number;
  set: Mutation<TideTables[T]>;
  // At most one row per value of `column` is held at a time, counting rows
  // matching `held` that an earlier claim took. Applies to the values in
  // `only`; every other value claims freely.
  onePer?: { column: keyof TideTables[T] & string; held: Where<TideTables[T]>; only: readonly string[] };
};

export type RemoveSpec<T extends TableName = TableName> = {
  table: T;
  where?: Where<TideTables[T]>;
};

export type TideStore = {
  transact: <T>(fn: (tx: TideStore) => Promise<T>) => Promise<T>;

  appendIfAbsent: <T extends TableName>(
    table: T,
    row: Omit<TideTables[T], 'id'> & { id?: string },
  ) => Promise<TideTables[T] | undefined>;

  claim: <T extends TableName>(spec: ClaimSpec<T>) => Promise<readonly TideTables[T][]>;

  cas: <T extends TableName>(
    table: T,
    id: string,
    expect: Where<TideTables[T]>,
    set: Mutation<TideTables[T]>,
  ) => Promise<boolean>;

  query: <T extends TableName>(spec: QuerySpec<T>) => Promise<readonly TideTables[T][]>;

  // Removing a run removes its tasks.
  remove: <T extends TableName>(spec: RemoveSpec<T>) => Promise<number>;
};

export type { Reflex, ReflexInput, FactInput };
