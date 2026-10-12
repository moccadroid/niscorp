import { FactInputSchema } from '../schemas';
import { TideError } from '../errors';
import type { AttemptOutcome, FactInput, NewFact, Task, TideCtx, TideStore } from '../types';
import { evaluateTemplate, withNow } from './runtime';
import { admitFact, announceFact } from './facts';
import type { Admission } from './facts';
import type { EngineDeps } from './runtime';

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
      claimedUntil: { lte: now },
    },
    // `unit` breaks ties: one fan-out's tasks share `notBefore` and `createdAt`,
    // and two stores must order them the same way.
    order: [{ by: 'notBefore' }, { by: 'createdAt' }, { by: 'unit' }],
    limit,
    set: { state: 'claimed', token, claimedUntil: now + deps.leaseMs, attempt: { inc: 1 } },
    onePer:
      serialReflexIds.length === 0
        ? undefined
        : { column: 'reflexId', held: { state: 'claimed', claimedUntil: { gt: now } }, only: serialReflexIds },
  });
};

export const executeTasks = async (deps: EngineDeps, now: number, limit: number): Promise<ExecuteReport> => {
  const report: ExecuteReport = { executed: 0, succeeded: 0, failed: 0, retrying: 0, reclaimed: 0 };

  // Read before the claim, which returns each row as it wrote it. Only a
  // metric, so a race between the two costs a count, not a guarantee.
  const lapsed = new Set(
    (
      await deps.store.query({
        table: 'task',
        where: { state: 'claimed', claimedUntil: { lte: now }, notBefore: { lte: now } },
        limit,
      })
    ).map((task) => task.id),
  );

  const token = deps.nextToken();
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
      // `write` and `signal` only: a `manual` fact fires a disabled reflex, and
      // `run` facts are minted by the settler alone.
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

    // Depth and identity are stamped by the engine: a handler that chose
    // either could escape the chain ceiling or the tenant boundary.
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

    const recorded = await record(deps, task, token, {
      state: next.state,
      notBefore: next.state === 'retrying' ? next.notBefore : task.notBefore,
      output,
      error,
      // A failed attempt's emits are dropped: its retry would mint them again.
      emits: outcome === 'ok' ? emits : [],
      at: now,
    });

    if (recorded === undefined) continue;
    // Announced after the commit: a rollback would have taken these rows back.
    for (const admission of recorded) announceFact(deps.emit, admission);

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

const record = async (deps: EngineDeps, task: Task, token: string, settlement: Settlement): Promise<readonly Admission[] | undefined> =>
  deps.store.transact(async (tx: TideStore) => {
    const settles = settlement.state === 'done' || settlement.state === 'failed';

    // The fence: `expect` is this claim's token and attempt, so an attempt
    // that finishes late is discarded. Two engines' tokens can collide; the
    // attempt, which the store bumps on every claim, cannot.
    const accepted = await tx.cas(
      'task',
      task.id,
      { token, attempt: task.attempt },
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
    if (!accepted) return undefined;

    const admissions: Admission[] = [];
    for (const emit of settlement.emits) admissions.push(await admitFact(tx, emit, deps.maxChainFacts));

    if (settles) {
      // Counted first, read second: the increment is the store's own
      // arithmetic, so the read sees every count that has landed. Read first,
      // two landings each find the run short of its total and neither settles it.
      await tx.cas(
        'run',
        task.runId,
        {},
        { done: { inc: settlement.state === 'done' ? 1 : 0 }, failed: { inc: settlement.state === 'failed' ? 1 : 0 } },
      );
      const [run] = await tx.query({ table: 'run', where: { id: task.runId }, limit: 1 });
      if (run !== undefined && run.done + run.failed >= run.total && run.settledAt === undefined)
        await tx.cas('run', run.id, { state: 'fanned' }, { state: 'settled', settledAt: settlement.at });
    }
    return admissions;
  });

// Two writes to the run. The count comes down whatever state the run is in: a
// second retry finds it already rewound. The rewind applies to a `settled`
// run only and leaves `drained` set, so the run fact is not emitted again.
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

    await tx.cas('run', task.runId, {}, { failed: { inc: -1 } });
    await tx.cas('run', task.runId, { state: 'settled' }, { state: 'fanned', settledAt: undefined });
    return true;
  });

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
    const admission = await admitFact(deps.store, {
      kind: 'run',
      reflex: run.reflexId,
      runId: run.id,
      occurrence: run.occurrence,
      stats: { total: run.total, done: run.done, failed: run.failed },
      at: now,
      depth: run.depth + 1,
      cause: `run:${run.id}`,
      as: run.as,
    }, deps.maxChainFacts);
    announceFact(deps.emit, admission);
  }

  return settled.length;
};
