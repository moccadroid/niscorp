import { TideError, isTideError } from '../errors';
import type { Fact, Row, Run, Task } from '../types';
import { buildEnv, evaluateTemplate } from './runtime';
import type { EngineDeps, LoadedReflex } from './runtime';

export const collectRows = async (
  source: AsyncIterable<Row> | Iterable<Row> | Promise<Iterable<Row>>,
  cap: number,
): Promise<readonly Row[]> => {
  const resolved = await source;
  const rows: Row[] = [];
  if (Symbol.asyncIterator in Object(resolved)) {
    for await (const row of resolved as AsyncIterable<Row>) {
      rows.push(row);
      if (rows.length > cap) throw new TideError('duplicate_unit', `selection exceeded maxFanOut (${cap})`);
    }
    return rows;
  }
  for (const row of resolved as Iterable<Row>) {
    rows.push(row);
    if (rows.length > cap) throw new TideError('duplicate_unit', `selection exceeded maxFanOut (${cap})`);
  }
  return rows;
};

type Unit = { unit: string; env: Row };

const unitsFrom = (rows: readonly Row[], unitKey: string | undefined, base: Row, reflexId: string): Unit[] => {
  const seen = new Set<string>();
  return rows.map((row) => {
    const raw = unitKey === undefined ? undefined : row[unitKey];
    const unit = raw === undefined || raw === null ? '' : String(raw);
    // Refused here: the unique key on tasks would drop the second row silently.
    if (seen.has(unit))
      throw new TideError('duplicate_unit', `${reflexId}: duplicate unit key "${unit}" — the selection's unitKey is not unique`);
    seen.add(unit);
    return { unit, env: { ...base, row } };
  });
};

const factRowsOf = async (deps: EngineDeps, run: Run): Promise<readonly Fact[]> => {
  const ids = run.factIds ?? [];
  if (ids.length === 0) return [];
  return deps.store.query({ table: 'fact', where: { id: { in: [...ids] } } });
};

export const fanOut = async (deps: EngineDeps, now: number, limit: number): Promise<number> => {
  let created = 0;

  const pending = await deps.store.query({
    table: 'run',
    where: { state: 'pending' },
    order: [{ by: 'dueAt' }],
    limit,
  });

  for (const run of pending) {
    const loaded = deps.find(run.reflexId);
    if (loaded === undefined) {
      await deps.store.cas('run', run.id, { state: 'pending' }, { state: 'skipped', settledAt: now, drained: true, note: 'reflex is no longer loaded' });
      continue;
    }

    try {
      const facts = await factRowsOf(deps, run);
      const units = await unitsForRun(deps, loaded, shapeOf(run), facts, now);
      created += await commitFanout(deps, run, units.map((unit) => taskOf(unit, run, loaded, now)), units.length, now);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      // A TideError means the reflex itself is wrong: the run is skipped, for
      // good. Anything else came out of a host seam (the selection, the
      // transform, the database): the run stays `pending` and is tried again.
      if (isTideError(error)) {
        await deps.store.cas('run', run.id, { state: 'pending' }, { state: 'skipped', settledAt: now, drained: true, note: `fan-out refused: ${reason}` });
        deps.emit({ type: 'run.skipped', reflexId: run.reflexId, reason });
        continue;
      }

      await deps.store.cas('run', run.id, { state: 'pending' }, { note: `fan-out deferred: ${reason}` });
      deps.emit({ type: 'run.deferred', reflexId: run.reflexId, runId: run.id, reason });
    }
  }

  return created;
};

// The tasks and the run's move to `fanned` commit together: after a crash the
// run is still `pending` with no tasks, and the next fan-out selects afresh.
const commitFanout = async (
  deps: EngineDeps,
  run: Run,
  tasks: readonly Omit<Task, 'id'>[],
  selected: number,
  now: number,
): Promise<number> =>
  deps.store.transact(async (tx) => {
    const claimed = await tx.cas('run', run.id, { state: 'pending' }, { state: 'fanned' });
    if (!claimed) return 0;

    let written = 0;
    for (const task of tasks) if ((await tx.appendIfAbsent('task', task)) !== undefined) written += 1;

    // `total` counts the tasks written, not offered: one the unique key refused
    // never lands, and a run waiting on it would never settle.
    const settledNow = written === 0;
    await tx.cas(
      'run',
      run.id,
      {},
      {
        selected,
        total: written,
        state: settledNow ? 'settled' : 'fanned',
        settledAt: settledNow ? now : undefined,
      },
    );
    return written;
  });

const taskOf = (unit: Unit, run: Run, loaded: LoadedReflex, now: number): Omit<Task, 'id'> => ({
  runId: run.id,
  reflexId: loaded.reflex.id,
  unit: unit.unit,
  cause: run.cause,
  env: unit.env,
  // Carried on the task: a swept run must not reset the chain ceiling.
  depth: run.depth,
  state: 'pending',
  attempt: 0,
  claimedUntil: 0,
  notBefore: run.dueAt > now ? run.dueAt : now,
  createdAt: now,
});

export type RunShape = { cause: string; occurrence?: string; dueAt: number };

const shapeOf = (run: Run): RunShape => ({ cause: run.cause, occurrence: run.occurrence, dueAt: run.dueAt });

export const unitsForRun = async (
  deps: EngineDeps,
  loaded: LoadedReflex,
  run: RunShape,
  facts: readonly Fact[],
  now: number,
): Promise<Unit[]> => {
  const { reflex } = loaded;

  const base = buildEnv({
    params: reflex.params,
    occurrence: run.occurrence === undefined ? undefined : { key: run.occurrence, at: run.dueAt },
    fact: facts.length === 1 ? { ...facts[0] } : undefined,
    facts: facts.length > 1 ? facts.map((fact) => ({ ...fact })) : undefined,
    now,
  });

  const carried = facts.map((fact) => fact.row).filter((row): row is Row => row !== undefined);
  if (carried.length > 0 && reflex.select === undefined) return unitsFrom(carried, undefined, base, reflex.id);

  if (reflex.select === undefined) return [{ unit: '', env: base }];

  if (deps.select === undefined)
    throw new TideError('store', `${reflex.id} has a selection but no \`select\` seam is wired`);

  const query = evaluateTemplate(deps.transform, reflex.select.query, base);
  const rows = await collectRows(
    deps.select(query, { reflexId: reflex.id, now, actor: deps.actorFor(reflex.as), env: base }),
    deps.maxFanOut,
  );

  if (reflex.select.mode === 'batch') return [{ unit: '', env: { ...base, rows } }];
  return unitsFrom(rows, reflex.select.unitKey, base, reflex.id);
};

export type { Unit };
