import type { FactInput, Reflex, ReflexInput } from './schemas';

export type Row = Record<string, unknown>;

// ═══════════════════════════════════════════════════════════════
// The ledger — four tables, and only two of them grow with events
//
// There were seven: fact, delivery, firing, task, attempt, window,
// watermark. Six of those were vocabulary. A design noun is not a
// reason for a table; a GUARANTEE is, and each of these carries one:
//
//   fact   durable before anything interprets it, so `ingest` is one
//          write and matching is retryable in the advance
//   run    UNIQUE(reflexId, cause) — THE idempotency, one constraint
//          for every trigger kind; atomic fan-out; fan-in counting
//   task   UNIQUE(runId, unit) written BEFORE the effect; the lease;
//          the retry counter
//   state  where each reflex has got to. One row per reflex, bounded
//          by how many reflexes exist rather than by what happened
//
// What went, and where it went:
//   delivery  → the run's `cause`; a non-match is an event, not a row
//   attempt   → `attempt` and `error` on the task; per-attempt history
//               is the host's log, and nothing read it here
//   window    → deleted with coalesce, which nothing used
//   watermark → the clock through-line and the arming baseline are two
//               fields on `state`, not an unbounded key/value table with
//               a growing set of string keys
// ═══════════════════════════════════════════════════════════════

export type Fact = FactInput & {
  id: string;
  // WHOSE FACT THIS IS — the `as` of the reflex that minted it, and absent on
  // anything the host ingested itself.
  //
  // Stamped by the engine, never by a handler, for the same reason `depth` is:
  // a handler that could choose its own identity could choose somebody else's.
  // Tide does not know what the string means. It only knows that a fact minted
  // under one identity must not wake a reflex running under another — which is
  // what stops a row selected for one tenant being handed to another tenant's
  // effect. See `reflexMatchesFact`.
  as?: string;
  // Distance from the root stimulus. An effect's emit inherits its
  // task's depth + 1, which is what lets a divergent loop hit a
  // ceiling instead of melting the ledger.
  depth: number;
  // A fact is done once it has been offered to every LOADED reflex —
  // matching is per (fact, reflex), and one fact can wake five.
  deliveredAt?: number;
  parked?: string;
  // A human looked at a parked fact and said "run it anyway". Without
  // this the release is a ping-pong: the matcher re-parks on the next
  // tick, because the depth that parked it has not changed and never
  // will. The override is recorded rather than faked by rewriting depth,
  // which would make the ledger lie about causality.
  released?: boolean;
};

export type RunState = 'pending' | 'fanned' | 'settled' | 'skipped';

// One execution of one reflex. Named `run` rather than `firing` because
// `firing` was also a trigger kind and a fact kind — one word doing three
// jobs, and the reason `fact: { firing: … }` read as a puzzle.
export type Run = {
  id: string;
  reflexId: string;
  version: string;
  // The host identity this ran under, copied from the reflex. Opaque to
  // tide and written down so the ledger is scopeable by an ordinary
  // host-side rule instead of by parsing reflex ids.
  as?: string;
  // 'occurrence:<key>' | 'fact:<id>' | 'run:<id>' | 'manual:<who>' —
  // provenance, and half of the task's idempotency key.
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
  // Whether this run's settlement has already been announced as a fact.
  // Separate from `settledAt` because a reopened task RE-settles its run
  // and must not mint a second fan-in fact: the digest watching it already
  // went out. The flag is what lets the recovery verb rewind safely.
  drained?: boolean;
  note?: string;
};

// How one attempt ended. There is no attempt TABLE — the count and the last
// error live on the task, and per-attempt history is the host's log, which
// is where it was already being read from. The distinction still matters to
// the executor, so it still has a name.
export type AttemptOutcome = 'ok' | 'error' | 'timeout';

export type TaskState = 'pending' | 'claimed' | 'retrying' | 'done' | 'failed';

export type Task = {
  id: string;
  runId: string;
  reflexId: string;
  // The unit's grain: a row key in `each`, '' for batch and unit-less runs.
  unit: string;
  cause: string;
  // The pinned environment slice. Frozen at fan-out so a retry evaluates
  // against the same data the selection saw, never against moved data.
  env: Row;
  // Stamped from the run at fan-out, not read back from it at execution
  // time. A run swept out from under a long-running chain used to reset
  // the ceiling to 0 — defeating the backstop in exactly the long-running
  // case it exists for. The task carries what the task needs.
  depth: number;
  state: TaskState;
  attempt: number;
  token?: string;
  // THE LEASE, and expiry IS the reclaim. Without one, a process that died
  // between the effect and the record left the task `claimed` forever: its
  // run never settled, never drained, and an `overlap: 'skip'` reflex was
  // blocked for good. No reaper, no heartbeat — a claim whose lease has
  // lapsed is simply claimable again, which the fencing token makes safe.
  //
  // ZERO, not null, when unclaimed. "Never claimed or lapsed" is then one
  // comparison rather than a disjunction, which keeps the claim expressible
  // in a query grammar that has no OR — and a grammar with no OR is a
  // grammar every store can implement.
  claimedUntil: number;
  notBefore: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  createdAt: number;
  settledAt?: number;
};

// Where a reflex has got to. ONE ROW PER REFLEX — bounded by how many
// reflexes exist, never by how much has happened, which is what separates
// it from the ledger proper and is why it survived the collapse.
export type ReflexState = {
  reflexId: string;
  // Matching starts here. A reflex never retro-fires: history from before
  // it existed is reachable by deliberate backfill, never by accident.
  armedAt: number;
  // The clock's through-line. Derivable from MAX(cause) over the runs, but
  // only while those runs exist — and retention is allowed to delete them.
  materializedThrough?: number;
};

// ═══════════════════════════════════════════════════════════════
// The seams — five injection points
// ═══════════════════════════════════════════════════════════════

// What an effect handler and the select seam receive. `actor` is opaque:
// tide never learns what a principal is (under moss it is an ActorContext,
// charter-resolved and engine-enforced).
export type TideCtx = {
  reflexId: string;
  runId: string;
  taskId: string;
  // The downstream idempotency key. A payment capture passes this to the
  // provider, which is what makes a fenced-out zombie attempt harmless.
  taskKey: string;
  attempt: number;
  // How deep in a cause chain this task sits. A handler whose side effects
  // re-enter as facts (a write through the host's own DAL, minted back by
  // the bridge) forwards this with the write, so the chain ceiling survives
  // the trip through the database instead of resetting at every hop.
  depth: number;
  now: number;
  actor: unknown;
  // Continue a chain from inside a handler. Buffered — the fact commits
  // with a SUCCESSFUL attempt, so a retry cannot double-mint it — and
  // narrowed to `write` and `signal`, because a handler that could emit
  // `manual` would reach past the arming switch.
  emit: (fact: Omit<FactInput, 'cause'>) => void;
};

export type EffectHandler = {
  run: (input: unknown, ctx: TideCtx) => Promise<unknown> | unknown;
  // What this effect writes. Feeds the flow graph and its cycle refusal —
  // an edge is a write meeting a watch. Under moss it is DERIVED from the
  // vex mutation behind the effect, never declared; a handler with no
  // `writes` is a BLIND edge the load report names.
  writes?: readonly string[];
  // Rendered by `preview` in place of running. Nothing else is needed to
  // make a reflex previewable — the executor is the only door out.
  preview?: (input: unknown, ctx: PreviewCtx) => unknown;
};

export type PreviewCtx = { reflexId: string; unit: string; now: number; actor: unknown };

export type EffectRegistry = Record<string, EffectHandler>;

export type TransformFn = (config: unknown, source: Row) => unknown;

export type SelectFn = (query: unknown, ctx: SelectCtx) => AsyncIterable<Row> | Iterable<Row> | Promise<Iterable<Row>>;

export type SelectCtx = { reflexId: string; now: number; actor: unknown; env: Row };

export type ActorFn = (as: string | undefined) => unknown;

// ═══════════════════════════════════════════════════════════════
// Config and reports
// ═══════════════════════════════════════════════════════════════

export type Retention = Partial<Record<'facts' | 'runs' | 'tasks', number>>;

export type TideConfig = {
  store: TideStore;
  transform: TransformFn;
  select?: SelectFn;
  effects?: EffectRegistry | ((as: string | undefined) => EffectRegistry);
  actor?: ActorFn;
  // A fact whose cause chain runs deeper than this is PARKED for review
  // rather than fired — the runtime backstop behind the load-time cycle
  // rules, and nearly free because causality is already recorded.
  maxChainDepth?: number;
  // KEEP A WRITE FACT NOTHING WATCHES? Default true, which is what the ledger
  // means today: `ledger.facts()` is every write the host committed, and
  // `causeChain` walks it — an audit trail that answers "why did this person
  // get this" without anybody having predicted the question.
  //
  // A host that mints a fact per committed ROW pays for that trail on the hot
  // path of every write: an INSERT here, awaited, for a fact no loaded reflex
  // could ever match. A host whose ledger is not its audit log sets this false
  // and pays only for the writes something is actually listening to.
  //
  // NOT retroactive and not clever: it drops nothing while no reflexes are
  // loaded (a fact arriving in that window still waits, exactly as matchFacts
  // has always let it), and it ignores enablement, arming and identity — the
  // question it asks is only "could any loaded reflex ever watch this entity
  // and op", which is strictly weaker than the matcher.
  storeUnwatchedWrites?: boolean;
  // How many units one fan-out may mint before the run is refused.
  maxFanOut?: number;
  // How long a claim is good for. A task still `claimed` past this is
  // claimable again — the only recovery a died-mid-effect process needs.
  leaseMs?: number;
  onEvent?: (event: TideEvent) => void;
};

export type TideEvent =
  | { type: 'run.created'; run: Run }
  | { type: 'run.settled'; run: Run }
  | { type: 'run.skipped'; reflexId: string; reason: string }
  // A fan-out that will be tried again next tick. Not a skip: a transient
  // selection failure must never consume an occurrence.
  | { type: 'run.deferred'; reflexId: string; runId: string; reason: string }
  | { type: 'task.done'; task: Task }
  | { type: 'task.failed'; task: Task }
  | { type: 'task.retrying'; task: Task; nextAt: number }
  // A lease lapsed and the work was taken back. Rare and worth seeing:
  // it means something died holding a task.
  | { type: 'task.reclaimed'; task: Task }
  | { type: 'fact.ingested'; fact: Fact }
  | { type: 'fact.parked'; fact: Fact; reason: string }
  // The `when` said no, or threw. Not a row — one per (fact, reflex) pair
  // is a table that grows faster than the work does — but not nothing
  // either, because "why didn't it fire" deserves an answer.
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
  // Guarded cycles are legal — a drip campaign IS a cycle. They are
  // reported so the author sees the loop they built.
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

// ═══════════════════════════════════════════════════════════════
// The store contract — six capabilities, not twenty-seven nouns
//
// The old port had a method per noun per verb, so `claimTasks`,
// `drainSettled` and `claimClosedWindows` were three implementations
// of ONE operation and diverged three ways. Shaped by what the
// guarantees need instead:
//
//   transact         several writes land together or not at all
//   appendIfAbsent   a row exists once, decided by the table's unique
//                    key rather than by a read the caller races
//   claim            take work exactly once, under a fence
//   cas              move a row only from the state you expected
//   query            read
//   remove           retention; the only thing that shrinks the ledger
//
// Structural and driver-free, the way vex's CacheBackend is. Nothing
// here knows about retry, arming, coalescing or occurrences — the
// engine holds every opinion, and the store holds none.
// ═══════════════════════════════════════════════════════════════

export type TideTables = {
  fact: Fact;
  run: Run;
  task: Task;
  state: ReflexState;
};

export type TableName = keyof TideTables;

// The row identity `cas` and `remove` address a single row by.
export const PRIMARY_KEY: { [T in TableName]: keyof TideTables[T] & string } = {
  fact: 'id',
  run: 'id',
  task: 'id',
  state: 'reflexId',
};

export type UniqueKey<T extends TableName> = {
  by: readonly (keyof TideTables[T] & string)[];
  // The constraint applies only when this column is present — in Postgres,
  // a partial unique index. A fact with no `dedupeKey` is not claiming to
  // be unique and is always appended.
  when?: keyof TideTables[T] & string;
};

// WHERE THE IDEMPOTENCY LIVES, written down once so every store agrees.
// These four constraints are the engine's exactly-once promises; they are
// not an optimisation and a store that omits one is not a tide store.
export const UNIQUE_BY: { [T in TableName]: UniqueKey<T> } = {
  // `entity` is part of the key. Without it two polls over different tables
  // that happened to agree on a cursor value silently ate each other's rows.
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

// A patch, plus the one thing a caller cannot compute without a read it
// would then race: an increment. `attempt` has to rise AT CLAIM TIME, or a
// handler that reliably kills the process retries forever.
export type Mutation<R> = { [K in keyof R]?: R[K] | { inc: number } };

export type ClaimSpec<T extends TableName = TableName> = {
  table: T;
  where?: Where<TideTables[T]>;
  order?: Order<TideTables[T]>;
  limit: number;
  // Applied to every claimed row, atomically with the selection.
  set: Mutation<TideTables[T]>;
  // `order: 'serial'`. At most one row per distinct value of `column` may
  // be held at once, counting rows some earlier claim is already holding —
  // so it lives INSIDE the claim rather than as a filter the caller applies
  // first and loses the race on.
  //
  // `only` names exactly the values this applies to, and it is REQUIRED
  // rather than defaulting to "everything": a store implementing "all
  // groups" has to enumerate the groups first, and an omitted list that
  // silently means "all of them" is the kind of default two implementations
  // read two ways. Everything outside it claims freely. Omit `onePer`
  // entirely when nothing is serial.
  onePer?: { column: keyof TideTables[T] & string; held: Where<TideTables[T]>; only: readonly string[] };
};

export type RemoveSpec<T extends TableName = TableName> = {
  table: T;
  where?: Where<TideTables[T]>;
};

export type TideStore = {
  // Several writes land together or not at all. The engine's two atomic
  // moments — fan-out committing with its run's transition, and an attempt
  // recording with the facts it emitted — are transactions, not conventions.
  transact: <T>(fn: (tx: TideStore) => Promise<T>) => Promise<T>;

  // Idempotent on the table's unique key. A duplicate materialization, a
  // replayed webhook, or a second instance's tick collides and gets
  // `undefined` — a refusal, not an error. `id` is minted by the store.
  appendIfAbsent: <T extends TableName>(
    table: T,
    row: Omit<TideTables[T], 'id'> & { id?: string },
  ) => Promise<TideTables[T] | undefined>;

  // Take rows exactly once. Selection and mutation are one step, which is
  // the whole promise: two instances ticking at the same moment contend
  // rather than duplicate.
  claim: <T extends TableName>(spec: ClaimSpec<T>) => Promise<readonly TideTables[T][]>;

  // Move a row only from the state you expected. The fence: a timed-out
  // attempt finishing late finds its token superseded and is discarded
  // rather than overwriting the live one.
  cas: <T extends TableName>(
    table: T,
    id: string,
    expect: Where<TideTables[T]>,
    set: Mutation<TideTables[T]>,
  ) => Promise<boolean>;

  query: <T extends TableName>(spec: QuerySpec<T>) => Promise<readonly TideTables[T][]>;

  // Retention, and the only thing that shrinks the ledger. Deleting a run
  // cascades to its tasks: the run and its members are one fact about the
  // world, and half of it is worse than neither.
  remove: <T extends TableName>(spec: RemoveSpec<T>) => Promise<number>;
};

export type { Reflex, ReflexInput, FactInput };
