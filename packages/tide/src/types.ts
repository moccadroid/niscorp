import type { FactInput, Reflex, ReflexInput } from './schemas';

export type Row = Record<string, unknown>;

// ═══════════════════════════════════════════════════════════════
// The ledger — four row kinds
//
// Facts, firings, tasks and attempts. Host-readable data, because
// the operator's "what has the system been doing" screen must be
// an ordinary query over ordinary rows, not a tide API.
// ═══════════════════════════════════════════════════════════════

export type Fact = FactInput & {
  id: string;
  // Distance from the root stimulus. An effect's emit inherits its
  // task's depth + 1, which is what lets a divergent loop hit a
  // ceiling instead of melting the ledger.
  depth: number;
  parked?: string;
};

export type DeliveryOutcome = 'fired' | 'coalesced' | 'no-match' | 'error' | 'skipped';

export type Delivery = {
  factId: string;
  reflexId: string;
  outcome: DeliveryOutcome;
  at: number;
  note?: string;
};

export type FiringState = 'pending' | 'fanned' | 'settled' | 'skipped';

export type Firing = {
  id: string;
  reflexId: string;
  version: string;
  // 'occurrence:<key>' | 'fact:<id>' | 'manual:<who>' — provenance, and
  // half of the task's idempotency key.
  cause: string;
  occurrence?: string;
  factIds?: readonly string[];
  state: FiringState;
  depth: number;
  selected?: number;
  total: number;
  done: number;
  failed: number;
  dueAt: number;
  createdAt: number;
  settledAt?: number;
  note?: string;
};

export type TaskState = 'pending' | 'claimed' | 'done' | 'retrying' | 'failed';

export type Task = {
  id: string;
  firingId: string;
  reflexId: string;
  // The unit's grain: a row key in `each`, '' for batch and unit-less firings.
  unit: string;
  cause: string;
  // The pinned environment slice. Frozen at fan-out so a retry evaluates
  // against the same data the selection saw, never against moved data.
  env: Row;
  state: TaskState;
  attempt: number;
  token?: string;
  notBefore: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  createdAt: number;
  settledAt?: number;
};

export type AttemptOutcome = 'ok' | 'error' | 'timeout';

export type Attempt = {
  id: string;
  taskId: string;
  reflexId: string;
  n: number;
  token: string;
  startedAt: number;
  endedAt: number;
  outcome: AttemptOutcome;
  error?: string;
};

// ═══════════════════════════════════════════════════════════════
// The seams — five injection points
// ═══════════════════════════════════════════════════════════════

// What an effect handler and the select seam receive. `actor` is opaque:
// tide never learns what a principal is (under moss it is an ActorContext,
// charter-resolved and engine-enforced).
export type TideCtx = {
  reflexId: string;
  firingId: string;
  taskId: string;
  // The downstream idempotency key. A payment capture passes this to the
  // provider, which is what makes a fenced-out zombie attempt harmless.
  taskKey: string;
  attempt: number;
  now: number;
  actor: unknown;
  // Continue a chain from inside a handler. Buffered — the fact commits
  // with a SUCCESSFUL attempt, so a retry cannot double-mint it.
  emit: (fact: Omit<FactInput, 'cause'>) => void;
};

export type EffectHandler = {
  run: (input: unknown, ctx: TideCtx) => Promise<unknown> | unknown;
  // What this effect writes. Feeds the flow graph and its cycle refusal;
  // under moss it is DERIVED from the vex mutation, never declared.
  touches?: readonly string[];
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

export type Retention = Partial<Record<'facts' | 'firings' | 'tasks' | 'attempts', number>>;

export type TideConfig = {
  store: TideStoreLike;
  transform: TransformFn;
  select?: SelectFn;
  effects?: EffectRegistry | ((as: string | undefined) => EffectRegistry);
  actor?: ActorFn;
  // A fact whose cause chain runs deeper than this is PARKED for review
  // rather than fired — the runtime backstop behind the load-time cycle
  // rules, and nearly free because causality is already recorded.
  maxChainDepth?: number;
  // How many units one fan-out may mint before the firing is refused.
  maxFanOut?: number;
  onEvent?: (event: TideEvent) => void;
};

export type TideEvent =
  | { type: 'firing.created'; firing: Firing }
  | { type: 'firing.settled'; firing: Firing }
  | { type: 'firing.skipped'; reflexId: string; reason: string }
  | { type: 'task.done'; task: Task }
  | { type: 'task.failed'; task: Task }
  | { type: 'task.retrying'; task: Task; nextAt: number }
  | { type: 'fact.ingested'; fact: Fact }
  | { type: 'fact.parked'; fact: Fact; reason: string };

export type TickReport = {
  now: number;
  materialized: number;
  skippedOccurrences: number;
  polled: number;
  factsMatched: number;
  firingsCreated: number;
  tasksCreated: number;
  executed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  firingsSettled: number;
  parked: number;
};

export type LoadReport = {
  loaded: number;
  // Guarded cycles are legal — a drip campaign IS a cycle. They are
  // reported so the author sees the loop they built.
  cycles: readonly { reflexIds: readonly string[]; guarded: boolean }[];
  unverifiable: readonly { reflexId: string; effect: string }[];
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

// ═══════════════════════════════════════════════════════════════
// The store contract
//
// Structural and driver-free, the way vex's CacheBackend is. Two
// promises carry the whole design: `commitFanout` is ATOMIC with
// the firing's transition, and `record` is TOKEN-FENCED. Every
// other method is ordinary persistence.
// ═══════════════════════════════════════════════════════════════

export type NewFact = FactInput & { depth: number };

export type CoalesceWindow = {
  id: string;
  reflexId: string;
  key: string;
  factIds: readonly string[];
  opensAt: number;
  closesAt: number;
};

export type ClaimOptions = {
  now: number;
  limit: number;
  // Reflexes whose policy is order: 'serial' — at most one in-flight task each.
  serialReflexIds: readonly string[];
};

export type RecordResult = {
  outcome: AttemptOutcome;
  output?: unknown;
  error?: string;
  // Where the task lands. Computed by the executor from the policy, so the
  // store stays free of retry semantics.
  next: { state: 'done' } | { state: 'failed' } | { state: 'retrying'; notBefore: number };
  emits: readonly NewFact[];
  at: number;
};

export type SettledFiring = { firing: Firing; fact?: Fact };

export type TideStoreLike = {
  // ── facts ────────────────────────────────────────────────────
  insertFact: (fact: NewFact) => Promise<Fact | undefined>;
  dueFacts: (now: number, limit: number) => Promise<readonly Fact[]>;
  recordDelivery: (delivery: Delivery) => Promise<void>;
  // Matching is per (fact, reflex) — one fact can wake five reflexes — so
  // the fact is done only once it has been offered to every loaded one.
  completeFact: (factId: string, at: number) => Promise<void>;
  parkFact: (factId: string, reason: string) => Promise<void>;
  releaseFact: (factId: string) => Promise<boolean>;
  getFact: (factId: string) => Promise<Fact | undefined>;
  listFacts: (filter?: { reflexId?: string; limit?: number }) => Promise<readonly Fact[]>;

  // ── firings ──────────────────────────────────────────────────
  // Idempotent on (reflexId, cause): a duplicate materialization or a
  // second instance's tick collides and gets `undefined`, which is a
  // refusal, not an error.
  createFiring: (firing: Omit<Firing, 'id'>) => Promise<Firing | undefined>;
  patchFiring: (id: string, patch: Partial<Firing>) => Promise<void>;
  getFiring: (id: string) => Promise<Firing | undefined>;
  unsettledFiring: (reflexId: string) => Promise<Firing | undefined>;
  pendingFirings: (limit: number) => Promise<readonly Firing[]>;
  listFirings: (filter?: { reflexId?: string; limit?: number }) => Promise<readonly Firing[]>;

  // ── tasks ────────────────────────────────────────────────────
  // ATOMIC: the tasks and the firing's move to `fanned` commit together.
  // A crash mid-fan-out must leave nothing to resume FROM, because
  // resuming would re-select against moved data.
  commitFanout: (firingId: string, tasks: readonly Omit<Task, 'id'>[], selected: number) => Promise<number>;
  claimTasks: (opts: ClaimOptions) => Promise<readonly Task[]>;
  // TOKEN-FENCED: returns false when the task has moved on (a timed-out
  // attempt finishing late). Emits commit with a successful attempt only.
  recordAttempt: (taskId: string, token: string, result: RecordResult) => Promise<boolean>;
  getTask: (id: string) => Promise<Task | undefined>;
  listTasks: (filter?: { firingId?: string; reflexId?: string; state?: TaskState; limit?: number }) => Promise<readonly Task[]>;
  listAttempts: (taskId: string) => Promise<readonly Attempt[]>;
  reopenTask: (taskId: string, now: number) => Promise<Task | undefined>;
  // Firings whose last task just settled — the fan-in mechanism's source.
  drainSettled: () => Promise<readonly Firing[]>;

  // ── watermarks ───────────────────────────────────────────────
  getWatermark: (reflexId: string) => Promise<string | undefined>;
  setWatermark: (reflexId: string, value: string) => Promise<void>;

  // ── coalescing ───────────────────────────────────────────────
  appendCoalesce: (reflexId: string, key: string, factId: string, now: number, windowMs: number) => Promise<void>;
  claimClosedWindows: (now: number) => Promise<readonly CoalesceWindow[]>;

  // ── hygiene ──────────────────────────────────────────────────
  sweep: (now: number, retention: Retention) => Promise<number>;
};

export type { Reflex, ReflexInput, FactInput };
