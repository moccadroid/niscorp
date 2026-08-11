import type { AttemptOutcome, FactInput, NewFact, RecordResult, Task, TideCtx } from '../types';
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

export type ExecuteReport = { executed: number; succeeded: number; failed: number; retrying: number };

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

export const executeTasks = async (deps: EngineDeps, now: number, limit: number): Promise<ExecuteReport> => {
  const report: ExecuteReport = { executed: 0, succeeded: 0, failed: 0, retrying: 0 };

  const serialReflexIds = deps
    .reflexes()
    .filter((loaded) => loaded.reflex.policy.order === 'serial')
    .map((loaded) => loaded.reflex.id);

  const claimed = await deps.store.claimTasks({ now, limit, serialReflexIds });

  for (const task of claimed) {
    const loaded = deps.find(task.reflexId);
    const token = task.token;
    if (loaded === undefined || token === undefined) continue;

    const { reflex } = loaded;
    const registry = deps.effectsFor(reflex.as);
    const handler = registry[reflex.effect.name];
    const env = withNow(task.env, now);

    const buffered: NewFact[] = [];
    const ctx: TideCtx = {
      reflexId: reflex.id,
      firingId: task.firingId,
      taskId: task.id,
      taskKey: `${reflex.id}:${task.cause}:${task.unit}`,
      attempt: task.attempt,
      now,
      actor: deps.actorFor(reflex.as),
      // Depth is stamped from the firing below — the handler never sets it,
      // because a handler that could choose its own depth could escape the
      // chain ceiling.
      emit: (fact: Omit<FactInput, 'cause'>) => {
        buffered.push({ ...fact, cause: `task:${task.id}`, depth: 0 });
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

    const depth = (await deps.store.getFiring(task.firingId))?.depth ?? 0;
    const emits = buffered.map((fact) => ({ ...fact, depth: depth + 1 }));

    const retry = reflex.policy.retry;
    const maxAttempts = (retry?.max ?? 3) + 1;
    const next: RecordResult['next'] =
      outcome === 'ok'
        ? { state: 'done' }
        : task.attempt >= maxAttempts
          ? { state: 'failed' }
          : {
              state: 'retrying',
              notBefore: now + backoffFor(task.attempt, retry?.baseMs ?? 60_000, retry?.backoff ?? 'exponential'),
            };

    const accepted = await deps.store.recordAttempt(task.id, token, {
      outcome,
      output,
      error,
      next,
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
    const settledTask = await deps.store.getTask(task.id);
    if (next.state === 'done') {
      report.succeeded += 1;
      if (settledTask !== undefined) deps.emit({ type: 'task.done', task: withInput(settledTask, input) });
    } else if (next.state === 'failed') {
      report.failed += 1;
      if (settledTask !== undefined) deps.emit({ type: 'task.failed', task: withInput(settledTask, input) });
    } else {
      report.retrying += 1;
      if (settledTask !== undefined)
        deps.emit({ type: 'task.retrying', task: withInput(settledTask, input), nextAt: next.notBefore });
    }
  }

  return report;
};

const withInput = (task: Task, input: unknown): Task => ({ ...task, input });

// A firing settles when its last task does — and tide, being the bookkeeper
// of its own fan-out, is the only thing that knows. Emitting that knowledge
// as an ordinary fact is the entire fan-in mechanism: no barrier primitive,
// no "am I last?" logic in a handler.
export const settleFirings = async (deps: EngineDeps, now: number): Promise<number> => {
  const settled = await deps.store.drainSettled();

  for (const firing of settled) {
    deps.emit({ type: 'firing.settled', firing });
    const fact = await deps.store.insertFact({
      kind: 'firing',
      reflex: firing.reflexId,
      firingId: firing.id,
      occurrence: firing.occurrence,
      stats: { total: firing.total, done: firing.done, failed: firing.failed },
      at: now,
      depth: firing.depth + 1,
      cause: `firing:${firing.id}`,
    });
    if (fact !== undefined) deps.emit({ type: 'fact.ingested', fact });
  }

  return settled.length;
};
