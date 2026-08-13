import { FactInputSchema } from '../schemas';
import { TideError } from '../errors';
import type { AttemptOutcome, FactInput, NewFact, Task, TideCtx, TideStore } from '../types';
import { evaluateTemplate, withNow } from './runtime';
import type { EngineDeps } from './runtime';

// ═══════════════════════════════════════════════════════════════
// Execute — the ONE door out of tide
//
// Everything that leaves — a write, an email, an agent — passes
// through this function. That single choke point is what makes
// preview a verb (stub one function and nothing can leak), the
// timeout uniform, the task key uniformly available, and the
// ledger complete. A second path outward would quietly break all
// four.
//
// Retry classification is a CALLING CONVENTION, not metadata:
// a handler that RETURNS is done (a card decline is a domain
// outcome, recorded as data and branched on by other reflexes);
// a handler that THROWS is transient and retried on bounded
// backoff to a terminal, human-visible state. The decision sits
// where the knowledge is — only the payment handler can tell a
// decline from a gateway 500 — and nobody can forget to declare it.
// ═══════════════════════════════════════════════════════════════

export type ExecuteReport = { executed: number; succeeded: number; failed: number; retrying: number; reclaimed: number };

const TIMEOUT = Symbol('tide.timeout');

const raceTimeout = async (work: Promise<unknown>, timeoutMs: number): Promise<unknown> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const backoffFor = (attempt: number, base: number, kind: 'fixed' | 'exponential'): number =>
  kind === 'fixed' ? base : base * Math.pow(2, Math.max(0, attempt - 1));

// ONE TOKEN PER CLAIM, not per task. The fence's job is to tell THIS claim
// apart from an earlier one, and every task appears in at most one claim, so
// a batch-wide token separates exactly the pairs that need separating.
//
// A counter rather than a clock or a random: tide reads no clock, and a
// headless check that replays the same tick twice has to get the same
// answers. Uniqueness within a process is all a fence needs — across
// processes the store's own claim is what serialises, not the token's shape.
let tokens = 0;
const nextToken = (): string => {
  tokens += 1;
  return `tok_${tokens.toString(36)}`;
};

// CLAIMING IS ONE STEP, and it takes back lapsed leases in the same breath.
//
// A task still `claimed` past its lease is claimable again — that is the
// whole recovery story for a process that died between the effect and the
// record, and it needs no reaper, no heartbeat and no liveness table. The
// fencing token is what makes it safe: the dead process's attempt, should it
// somehow finish, finds its token superseded.
const claimTasks = async (deps: EngineDeps, now: number, limit: number, token: string): Promise<readonly Task[]> => {
  const serialReflexIds = deps
    .reflexes()
    .filter((loaded) => loaded.reflex.policy.order === 'serial')
    .map((loaded) => loaded.reflex.id);

  return deps.store.claim({
    table: 'task',
    where: {
      state: { in: ['pending', 'retrying', 'claimed'] },
      notBefore: { lte: now },
      // Either it was never claimed, or the claim has lapsed. Expressed as
      // one predicate because a second query would be a second decision.
      claimedUntil: { lte: now },
    },
    // `unit` is the tiebreaker, and it is not cosmetic. Every task of one
    // fan-out shares a `notBefore` and a `createdAt`, so with two keys the
    // order was whatever the storage engine felt like — insertion order in a
    // Map, heap order in Postgres. Two stores answering differently is the
    // thing the contract exists to prevent, and a headless check asserting on
    // the order effects ran in deserves the same answer everywhere.
    order: [{ by: 'notBefore' }, { by: 'createdAt' }, { by: 'unit' }],
    limit,
    set: { state: 'claimed', token, claimedUntil: now + deps.leaseMs, attempt: { inc: 1 } },
    // `order: 'serial'` — at most one live claim per reflex, counting what
    // another claim already holds. Inside the claim, because a caller that
    // looks first and claims second loses the race to its own second tick.
    onePer:
      serialReflexIds.length === 0
        ? undefined
        : { column: 'reflexId', held: { state: 'claimed', claimedUntil: { gt: now } }, only: serialReflexIds },
  });
};

export const executeTasks = async (deps: EngineDeps, now: number, limit: number): Promise<ExecuteReport> => {
  const report: ExecuteReport = { executed: 0, succeeded: 0, failed: 0, retrying: 0, reclaimed: 0 };

  // Counted before the claim takes them back, because a claim returns the
  // row it wrote and the interesting fact is what the row USED to be. A
  // metric, so a race here costs a number rather than a guarantee.
  const lapsed = new Set(
    (
      await deps.store.query({
        table: 'task',
        where: { state: 'claimed', claimedUntil: { lte: now }, notBefore: { lte: now } },
        limit,
      })
    ).map((task) => task.id),
  );

  const token = nextToken();
  const claimed = await claimTasks(deps, now, limit, token);

  for (const task of claimed) {
    if (lapsed.has(task.id)) {
      report.reclaimed += 1;
      deps.emit({ type: 'task.reclaimed', task });
    }

    const loaded = deps.find(task.reflexId);
    if (loaded === undefined) continue;

    const { reflex } = loaded;
    const registry = deps.effectsFor(reflex.as);
    const handler = registry[reflex.effect.name];
    const env = withNow(task.env, now);

    const buffered: NewFact[] = [];
    const ctx: TideCtx = {
      reflexId: reflex.id,
      runId: task.runId,
      taskId: task.id,
      taskKey: `${reflex.id}:${task.cause}:${task.unit}`,
      attempt: task.attempt,
      depth: task.depth,
      now,
      actor: deps.actorFor(reflex.as),
      // VALIDATED, and narrowed to two kinds.
      //
      // `emit` used to accept anything: a handler could emit `kind: 'manual'`
      // and fire a DISARMED reflex, because manual facts are checked before
      // enablement on purpose — arming gates triggers, not people. A handler
      // is not a person. `run` is tide's own bookkeeping and is minted by the
      // settler, so it is refused for the same reason.
      //
      // A malformed emit THROWS, inside the handler, so the attempt fails
      // visibly. The alternative is a fact that stores, matches nothing and
      // vanishes — a chain that silently stops one hop in.
      //
      // Depth is stamped from the task below — the handler never sets it,
      // because a handler that could choose its own depth could escape the
      // chain ceiling.
      emit: (fact: Omit<FactInput, 'cause'>) => {
        if (fact.kind !== 'write' && fact.kind !== 'signal')
          throw new TideError('invalid_fact', `${reflex.id}: an effect may emit \`write\` or \`signal\` facts, not \`${fact.kind}\``);
        const parsed = FactInputSchema.safeParse({ ...fact, cause: `task:${task.id}` });
        if (!parsed.success)
          throw new TideError('invalid_fact', `${reflex.id}: emitted fact did not parse: ${parsed.error.issues.map((i) => i.message).join('; ')}`, {
            issues: parsed.error.issues,
          });
        buffered.push({ ...parsed.data, depth: 0 });
      },
    };

    let outcome: AttemptOutcome = 'ok';
    let output: unknown;
    let error: string | undefined;
    let input: unknown;

    try {
      input = evaluateTemplate(deps.transform, reflex.effect.input, env);
      if (handler === undefined) throw new Error(`effect "${reflex.effect.name}" is not registered`);
      const result = await raceTimeout(Promise.resolve(handler.run(input, ctx)), reflex.policy.timeoutMs);
      if (result === TIMEOUT) {
        outcome = 'timeout';
        error = `timed out after ${reflex.policy.timeoutMs}ms`;
      } else {
        output = result;
      }
    } catch (thrown) {
      outcome = 'error';
      error = thrown instanceof Error ? thrown.message : String(thrown);
    }

    // From the TASK, not read back from the run. A run swept out from under a
    // long-running chain used to answer `undefined`, resetting the ceiling to
    // 0 — defeating the backstop in exactly the swept, long-running case it
    // exists for.
    // Depth AND identity are stamped here, by the engine, from the task and
    // the reflex — never by the handler. A handler that could choose either
    // could escape the chain ceiling or the tenant boundary.
    const emits = buffered.map((fact) => ({ ...fact, depth: task.depth + 1, as: reflex.as }));

    const retry = reflex.policy.retry;
    const maxAttempts = (retry?.max ?? 3) + 1;
    const next =
      outcome === 'ok'
        ? ({ state: 'done' } as const)
        : task.attempt >= maxAttempts
          ? ({ state: 'failed' } as const)
          : ({
              state: 'retrying',
              notBefore: now + backoffFor(task.attempt, retry?.baseMs ?? 60_000, retry?.backoff ?? 'exponential'),
            } as const);

    const accepted = await record(deps, task, token, {
      state: next.state,
      notBefore: next.state === 'retrying' ? next.notBefore : task.notBefore,
      output,
      error,
      // A throwing attempt discards its buffer: otherwise every retry of an
      // emit-then-throw handler would double-mint facts and fire the chain twice.
      emits: outcome === 'ok' ? emits : [],
      at: now,
    });

    // Rejected means the fence held — a timed-out attempt finishing late
    // found its token superseded. Its external side effect is exactly what
    // the task key handed to the provider defends against.
    if (!accepted) continue;

    report.executed += 1;
    const [settled] = await deps.store.query({ table: 'task', where: { id: task.id }, limit: 1 });
    const reported = settled === undefined ? undefined : { ...settled, input };
    if (next.state === 'done') {
      report.succeeded += 1;
      if (reported !== undefined) deps.emit({ type: 'task.done', task: reported });
    } else if (next.state === 'failed') {
      report.failed += 1;
      if (reported !== undefined) deps.emit({ type: 'task.failed', task: reported });
    } else {
      report.retrying += 1;
      if (reported !== undefined) deps.emit({ type: 'task.retrying', task: reported, nextAt: next.notBefore });
    }
  }

  return report;
};

type Settlement = {
  state: Task['state'];
  notBefore: number;
  output?: unknown;
  error?: string;
  emits: readonly NewFact[];
  at: number;
};

// The task's landing, the facts it emitted and its run's counters, in ONE
// transaction. The store used to own this and therefore owned retry
// semantics with it; it is engine policy, and it now reads as engine policy.
const record = async (deps: EngineDeps, task: Task, token: string, settlement: Settlement): Promise<boolean> =>
  deps.store.transact(async (tx: TideStore) => {
    const settles = settlement.state === 'done' || settlement.state === 'failed';

    // THE FENCE. `expect` is the token, so an attempt that timed out and
    // finished late finds itself superseded and is discarded rather than
    // overwriting the live one.
    const accepted = await tx.cas(
      'task',
      task.id,
      { token },
      {
        state: settlement.state,
        token: undefined,
        claimedUntil: 0,
        output: settlement.output,
        error: settlement.error,
        notBefore: settlement.notBefore,
        settledAt: settles ? settlement.at : undefined,
      },
    );
    if (!accepted) return false;

    // Emits ride the SUCCESSFUL attempt's transaction. A throwing handler
    // discards its buffer, so a retry cannot double-mint a chain.
    for (const emit of settlement.emits) await tx.appendIfAbsent('fact', emit);

    if (settles) {
      const [run] = await tx.query({ table: 'run', where: { id: task.runId }, limit: 1 });
      if (run !== undefined) {
        const done = run.done + (settlement.state === 'done' ? 1 : 0);
        const failed = run.failed + (settlement.state === 'failed' ? 1 : 0);
        const complete = done + failed >= run.total && run.settledAt === undefined;
        await tx.cas(
          'run',
          run.id,
          {},
          {
            done: { inc: settlement.state === 'done' ? 1 : 0 },
            failed: { inc: settlement.state === 'failed' ? 1 : 0 },
            state: complete ? 'settled' : run.state,
            settledAt: complete ? settlement.at : run.settledAt,
          },
        );
      }
    }
    return true;
  });

// THE HUMAN RECOVERY VERB, and it must rewind the run.
//
// A failed task settled its run, and a claim only reaches tasks that are
// pending, retrying or lapsed. Reopening the task alone left it claimable in
// principle and unclaimed in practice — so `retry()`, the only documented
// exit from `failed`, did nothing at all.
//
// The old objection was real: a digest already went out saying twelve failed,
// and re-settling must not send it again. That is what `drained` answers. The
// run rewinds; the announcement does not repeat.
export const reopenTask = async (deps: EngineDeps, taskId: string, now: number): Promise<boolean> =>
  deps.store.transact(async (tx) => {
    const [task] = await tx.query({ table: 'task', where: { id: taskId }, limit: 1 });
    if (task === undefined || task.state !== 'failed') return false;

    const reopened = await tx.cas(
      'task',
      taskId,
      { state: 'failed' },
      { state: 'pending', notBefore: now, error: undefined, settledAt: undefined, token: undefined, claimedUntil: 0 },
    );
    if (!reopened) return false;

    await tx.cas('run', task.runId, { state: 'settled' }, { state: 'fanned', failed: { inc: -1 }, settledAt: undefined });
    return true;
  });

// A run settles when its last task does — and tide, being the bookkeeper of
// its own fan-out, is the only thing that knows. Emitting that knowledge as
// an ordinary fact is the entire fan-in mechanism: no barrier primitive, no
// "am I last?" logic in a handler.
//
// Exactly-once through `drained`, a FLAG ON THE ROW rather than an in-memory
// queue. A queue cannot survive a restart and cannot be rewound, which is
// what made the recovery verb and fan-in mutually exclusive.
export const settleRuns = async (deps: EngineDeps, now: number): Promise<number> => {
  const settled = await deps.store.claim({
    table: 'run',
    where: { state: 'settled', drained: { ne: true } },
    order: [{ by: 'settledAt' }],
    limit: 200,
    set: { drained: true },
  });

  for (const run of settled) {
    deps.emit({ type: 'run.settled', run });
    const fact = await deps.store.appendIfAbsent('fact', {
      kind: 'run',
      reflex: run.reflexId,
      runId: run.id,
      occurrence: run.occurrence,
      stats: { total: run.total, done: run.done, failed: run.failed },
      at: now,
      depth: run.depth + 1,
      cause: `run:${run.id}`,
      // A settlement is news about THIS reflex's work — counts of rows it
      // selected. Another tenant's digest has no business waking on it.
      as: run.as,
    });
    if (fact !== undefined) deps.emit({ type: 'fact.ingested', fact });
  }

  return settled.length;
};
