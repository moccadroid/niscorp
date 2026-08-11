import type {
  Attempt,
  ClaimOptions,
  CoalesceWindow,
  Delivery,
  Fact,
  Firing,
  NewFact,
  RecordResult,
  Retention,
  Task,
  TaskState,
  TideStoreLike,
} from '../types';

// ═══════════════════════════════════════════════════════════════
// The memory store
//
// The reference implementation of TideStore, and the one a headless
// check runs against: with a fake clock and stub effects the whole
// engine runs here, so a test advances time and asserts on rows
// with no sleeping and no database.
//
// Its exactly-once promises are free in a single-threaded runtime —
// which is exactly why the Postgres store must be held to the SAME
// contract tests. A store that lies passes checks that then fail
// in production.
// ═══════════════════════════════════════════════════════════════

type MemFact = Fact & { deliveredAt?: number };

export type MemoryStore = TideStoreLike & {
  // Test/inspection affordances. Never part of TideStoreLike — the engine
  // must not be able to reach around the contract.
  snapshot: () => {
    facts: readonly Fact[];
    firings: readonly Firing[];
    tasks: readonly Task[];
    attempts: readonly Attempt[];
    deliveries: readonly Delivery[];
  };
};

export const createMemoryStore = (): MemoryStore => {
  const facts = new Map<string, MemFact>();
  const firings = new Map<string, Firing>();
  const tasks = new Map<string, Task>();
  const attempts: Attempt[] = [];
  const deliveries: Delivery[] = [];
  const watermarks = new Map<string, string>();
  const windows = new Map<string, CoalesceWindow>();
  const dedupe = new Set<string>();
  const firingByCause = new Map<string, string>();
  const settledQueue: Firing[] = [];

  let sequence = 0;
  const nextId = (prefix: string): string => {
    sequence += 1;
    return `${prefix}_${sequence}`;
  };

  const dueAtOf = (fact: MemFact): number => fact.notBefore ?? fact.at;

  // ── facts ──────────────────────────────────────────────────────

  const insertFact = async (input: NewFact): Promise<Fact | undefined> => {
    if (input.dedupeKey !== undefined) {
      const key = `${input.kind}:${input.name ?? ''}:${input.dedupeKey}`;
      if (dedupe.has(key)) return undefined;
      dedupe.add(key);
    }
    const fact: MemFact = { ...input, id: nextId('fact') };
    facts.set(fact.id, fact);
    return fact;
  };

  const dueFacts = async (now: number, limit: number): Promise<readonly Fact[]> =>
    [...facts.values()]
      .filter((fact) => fact.deliveredAt === undefined && fact.parked === undefined && dueAtOf(fact) <= now)
      .sort((left, right) => dueAtOf(left) - dueAtOf(right))
      .slice(0, limit);

  const recordDelivery = async (delivery: Delivery): Promise<void> => {
    deliveries.push(delivery);
  };

  const completeFact = async (factId: string, at: number): Promise<void> => {
    const fact = facts.get(factId);
    if (fact !== undefined) facts.set(factId, { ...fact, deliveredAt: at });
  };

  const parkFact = async (factId: string, reason: string): Promise<void> => {
    const fact = facts.get(factId);
    if (fact !== undefined) facts.set(factId, { ...fact, parked: reason });
  };

  const releaseFact = async (factId: string): Promise<boolean> => {
    const fact = facts.get(factId);
    if (fact === undefined || fact.parked === undefined) return false;
    const { parked: _parked, ...released } = fact;
    facts.set(factId, released);
    return true;
  };

  const getFact = async (factId: string): Promise<Fact | undefined> => facts.get(factId);

  const listFacts = async (filter?: { reflexId?: string; limit?: number }): Promise<readonly Fact[]> => {
    const matched =
      filter?.reflexId === undefined
        ? [...facts.values()]
        : [...facts.values()].filter((fact) => fact.reflex === filter.reflexId || fact.target === filter.reflexId);
    return matched.slice(0, filter?.limit ?? matched.length);
  };

  // ── firings ────────────────────────────────────────────────────

  const createFiring = async (input: Omit<Firing, 'id'>): Promise<Firing | undefined> => {
    const causeKey = `${input.reflexId}::${input.cause}`;
    if (firingByCause.has(causeKey)) return undefined;
    const firing: Firing = { ...input, id: nextId('fir') };
    firings.set(firing.id, firing);
    firingByCause.set(causeKey, firing.id);
    return firing;
  };

  const patchFiring = async (id: string, patch: Partial<Firing>): Promise<void> => {
    const firing = firings.get(id);
    if (firing !== undefined) firings.set(id, { ...firing, ...patch });
  };

  const getFiring = async (id: string): Promise<Firing | undefined> => firings.get(id);

  const unsettledFiring = async (reflexId: string): Promise<Firing | undefined> =>
    [...firings.values()].find(
      (firing) => firing.reflexId === reflexId && (firing.state === 'pending' || firing.state === 'fanned'),
    );

  const pendingFirings = async (limit: number): Promise<readonly Firing[]> =>
    [...firings.values()]
      .filter((firing) => firing.state === 'pending')
      .sort((left, right) => left.dueAt - right.dueAt)
      .slice(0, limit);

  const listFirings = async (filter?: { reflexId?: string; limit?: number }): Promise<readonly Firing[]> => {
    const matched =
      filter?.reflexId === undefined
        ? [...firings.values()]
        : [...firings.values()].filter((firing) => firing.reflexId === filter.reflexId);
    const ordered = matched.sort((left, right) => right.createdAt - left.createdAt);
    return ordered.slice(0, filter?.limit ?? ordered.length);
  };

  // ── tasks ──────────────────────────────────────────────────────

  // Atomic by construction here; in Postgres this is one transaction.
  // The guarantee is what matters: a crash mid-fan-out leaves NOTHING
  // to resume from, because resuming would re-select against moved data.
  const commitFanout = async (
    firingId: string,
    newTasks: readonly Omit<Task, 'id'>[],
    selected: number,
  ): Promise<number> => {
    const firing = firings.get(firingId);
    if (firing === undefined || firing.state !== 'pending') return 0;
    for (const task of newTasks) {
      const stored: Task = { ...task, id: nextId('task') };
      tasks.set(stored.id, stored);
    }
    const settledNow = newTasks.length === 0;
    firings.set(firingId, {
      ...firing,
      state: settledNow ? 'settled' : 'fanned',
      selected,
      total: newTasks.length,
      settledAt: settledNow ? firing.dueAt : undefined,
    });
    // A zero-task firing settles immediately and still mints its fact —
    // "nothing was due" is an answer a digest may legitimately want.
    if (settledNow) {
      const settled = firings.get(firingId);
      if (settled !== undefined) settledQueue.push(settled);
    }
    return newTasks.length;
  };

  const claimTasks = async (opts: ClaimOptions): Promise<readonly Task[]> => {
    const serial = new Set(opts.serialReflexIds);
    const inFlight = new Set(
      [...tasks.values()].filter((task) => task.state === 'claimed').map((task) => task.reflexId),
    );
    const claimed: Task[] = [];

    const candidates = [...tasks.values()]
      .filter((task) => task.state === 'pending' || task.state === 'retrying')
      .filter((task) => task.notBefore <= opts.now)
      .filter((task) => firings.get(task.firingId)?.state === 'fanned')
      .sort((left, right) => left.notBefore - right.notBefore || left.createdAt - right.createdAt);

    for (const task of candidates) {
      if (claimed.length >= opts.limit) break;
      if (serial.has(task.reflexId) && inFlight.has(task.reflexId)) continue;
      const token = nextId('tok');
      const next: Task = { ...task, state: 'claimed', token, attempt: task.attempt + 1 };
      tasks.set(task.id, next);
      inFlight.add(task.reflexId);
      claimed.push(next);
    }
    return claimed;
  };

  const recordAttempt = async (taskId: string, token: string, result: RecordResult): Promise<boolean> => {
    const task = tasks.get(taskId);
    // The fence: a timed-out attempt that finishes late finds its token
    // superseded and is discarded rather than overwriting the live one.
    if (task === undefined || task.token !== token) return false;

    attempts.push({
      id: nextId('att'),
      taskId,
      reflexId: task.reflexId,
      n: task.attempt,
      token,
      startedAt: task.createdAt,
      endedAt: result.at,
      outcome: result.outcome,
      error: result.error,
    });

    const settles = result.next.state === 'done' || result.next.state === 'failed';
    tasks.set(taskId, {
      ...task,
      state: result.next.state,
      token: undefined,
      output: result.output,
      error: result.error,
      notBefore: result.next.state === 'retrying' ? result.next.notBefore : task.notBefore,
      settledAt: settles ? result.at : undefined,
    });

    // Emits ride the SUCCESSFUL attempt's transaction. A throwing handler
    // discards its buffer, so a retry cannot double-mint a chain.
    if (result.outcome === 'ok') for (const emit of result.emits) await insertFact(emit);

    if (settles) {
      const firing = firings.get(task.firingId);
      if (firing !== undefined) {
        const done = firing.done + (result.next.state === 'done' ? 1 : 0);
        const failed = firing.failed + (result.next.state === 'failed' ? 1 : 0);
        const complete = done + failed >= firing.total && firing.settledAt === undefined;
        const updated: Firing = {
          ...firing,
          done,
          failed,
          state: complete ? 'settled' : firing.state,
          settledAt: complete ? result.at : firing.settledAt,
        };
        firings.set(firing.id, updated);
        if (complete) settledQueue.push(updated);
      }
    }
    return true;
  };

  const getTask = async (id: string): Promise<Task | undefined> => tasks.get(id);

  const listTasks = async (filter?: {
    firingId?: string;
    reflexId?: string;
    state?: TaskState;
    limit?: number;
  }): Promise<readonly Task[]> => {
    const matched = [...tasks.values()].filter(
      (task) =>
        (filter?.firingId === undefined || task.firingId === filter.firingId) &&
        (filter?.reflexId === undefined || task.reflexId === filter.reflexId) &&
        (filter?.state === undefined || task.state === filter.state),
    );
    return matched.slice(0, filter?.limit ?? matched.length);
  };

  const listAttempts = async (taskId: string): Promise<readonly Attempt[]> =>
    attempts.filter((attempt) => attempt.taskId === taskId);

  // The human recovery verb. Deliberately does NOT rewind the firing: a
  // digest already went out saying twelve failed, and re-settling would
  // send it again.
  const reopenTask = async (taskId: string, now: number): Promise<Task | undefined> => {
    const task = tasks.get(taskId);
    if (task === undefined || task.state !== 'failed') return undefined;
    const reopened: Task = { ...task, state: 'pending', notBefore: now, error: undefined, settledAt: undefined };
    tasks.set(taskId, reopened);
    return reopened;
  };

  const drainSettled = async (): Promise<readonly Firing[]> => settledQueue.splice(0, settledQueue.length);

  // ── watermarks ─────────────────────────────────────────────────

  const getWatermark = async (reflexId: string): Promise<string | undefined> => watermarks.get(reflexId);

  const setWatermark = async (reflexId: string, value: string): Promise<void> => {
    watermarks.set(reflexId, value);
  };

  // ── coalescing ─────────────────────────────────────────────────

  // Fixed window from the first matched fact. A sliding window starves
  // forever under a steady stream, which is the failure a digest must
  // never have.
  const appendCoalesce = async (
    reflexId: string,
    key: string,
    factId: string,
    now: number,
    windowMs: number,
  ): Promise<void> => {
    const windowKey = `${reflexId}::${key}`;
    const open = windows.get(windowKey);
    if (open === undefined) {
      windows.set(windowKey, {
        id: nextId('win'),
        reflexId,
        key,
        factIds: [factId],
        opensAt: now,
        closesAt: now + windowMs,
      });
      return;
    }
    windows.set(windowKey, { ...open, factIds: [...open.factIds, factId] });
  };

  const claimClosedWindows = async (now: number): Promise<readonly CoalesceWindow[]> => {
    const closed: CoalesceWindow[] = [];
    for (const [windowKey, window] of windows) {
      if (window.closesAt <= now) {
        closed.push(window);
        windows.delete(windowKey);
      }
    }
    return closed;
  };

  // ── hygiene ────────────────────────────────────────────────────

  const sweep = async (now: number, retention: Retention): Promise<number> => {
    let removed = 0;
    const expired = (horizon: number | undefined, at: number | undefined): boolean =>
      horizon !== undefined && at !== undefined && at < now - horizon;

    for (const [id, fact] of facts)
      if (expired(retention.facts, fact.deliveredAt)) {
        facts.delete(id);
        removed += 1;
      }
    for (const [id, task] of tasks)
      if (expired(retention.tasks, task.settledAt)) {
        tasks.delete(id);
        removed += 1;
      }
    for (const [id, firing] of firings)
      if (expired(retention.firings, firing.settledAt)) {
        firings.delete(id);
        firingByCause.delete(`${firing.reflexId}::${firing.cause}`);
        removed += 1;
      }
    const attemptHorizon = retention.attempts;
    if (attemptHorizon !== undefined) {
      const kept = attempts.filter((attempt) => attempt.endedAt >= now - attemptHorizon);
      removed += attempts.length - kept.length;
      attempts.splice(0, attempts.length, ...kept);
    }
    return removed;
  };

  const snapshot = (): ReturnType<MemoryStore['snapshot']> => ({
    facts: [...facts.values()],
    firings: [...firings.values()],
    tasks: [...tasks.values()],
    attempts: [...attempts],
    deliveries: [...deliveries],
  });

  return {
    insertFact,
    dueFacts,
    recordDelivery,
    completeFact,
    parkFact,
    releaseFact,
    getFact,
    listFacts,
    createFiring,
    patchFiring,
    getFiring,
    unsettledFiring,
    pendingFirings,
    listFirings,
    commitFanout,
    claimTasks,
    recordAttempt,
    getTask,
    listTasks,
    listAttempts,
    reopenTask,
    drainSettled,
    getWatermark,
    setWatermark,
    appendCoalesce,
    claimClosedWindows,
    sweep,
    snapshot,
  };
};
