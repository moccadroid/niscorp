import { TideError, isTideError } from '../errors';
import type { Fact, Row, Run, Task } from '../types';
import { buildEnv, evaluateTemplate } from './runtime';
import type { EngineDeps, LoadedReflex } from './runtime';

// ═══════════════════════════════════════════════════════════════
// Fan out — a run becomes unit tasks
//
// Transactional, and that is the whole point. A fan-out that
// crashed at row 200 of 500 and RESUMED would re-select against
// moved data: a member who paid in the gap keeps a task minted
// from the stale pass. Committing the tasks with the run's
// transition means a crash leaves nothing to resume from, so the
// re-run selects fresh and mints clean.
// ═══════════════════════════════════════════════════════════════

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
    // A duplicate unit key means the run's GRAIN is wrong. Letting the
    // unique constraint eat the second row would hide an authoring error;
    // an authoring error is loud or it is invisible.
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

      // A TRANSIENT FAILURE MUST NOT CONSUME AN OCCURRENCE.
      //
      // Every throw used to mark the run `skipped`. Runs are idempotent on
      // (reflexId, cause), so the occurrence could never re-materialize —
      // one database hiccup during a selection destroyed that night's
      // billing run permanently, and because `skipped` is not `settled`,
      // anything waiting on it waited forever.
      //
      // The two cases are distinguishable and the distinction is the fix.
      // A TideError is tide's own refusal — a duplicate unit key, a
      // selection with no `select` seam — which means the REFLEX is wrong
      // and will be wrong again next tick. Anything else came out of a host
      // seam: the selection, the transform, the database. That is a bad
      // minute, not a bad reflex.
      //
      // Deferring leaves the run `pending`, which is a row past its due
      // time that a query can see — visible silence, not a vanished event.
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

// ATOMIC: the tasks and the run's move to `fanned` commit together. A crash
// mid-fan-out must leave NOTHING to resume from, because resuming would
// re-select against moved data.
const commitFanout = async (
  deps: EngineDeps,
  run: Run,
  tasks: readonly Omit<Task, 'id'>[],
  selected: number,
  now: number,
): Promise<number> =>
  deps.store.transact(async (tx) => {
    // Guarded on `pending`, so a second instance that fanned this run out
    // first finds nothing to do rather than minting a duplicate set.
    const claimed = await tx.cas('run', run.id, { state: 'pending' }, { state: 'fanned' });
    if (!claimed) return 0;

    let written = 0;
    for (const task of tasks) if ((await tx.appendIfAbsent('task', task)) !== undefined) written += 1;

    // `total` is what was WRITTEN, not what was offered. Counting the input
    // array meant any refusal by the unique key left `total` permanently
    // unreachable — the run never settled, never drained, and blocked its
    // reflex for good.
    const settledNow = written === 0;
    await tx.cas(
      'run',
      run.id,
      {},
      {
        selected,
        total: written,
        // A zero-task run settles immediately and still announces itself —
        // "nothing was due" is an answer a digest may legitimately want.
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
  // UNIQUE(runId, unit) — the idempotency grain, written BEFORE the effect
  // runs. There is no path to the effect that skips this row.
  cause: run.cause,
  env: unit.env,
  // Carried, not looked up later: a swept run must not reset the chain
  // ceiling for work that is still in flight.
  depth: run.depth,
  state: 'pending',
  attempt: 0,
  claimedUntil: 0,
  notBefore: run.dueAt > now ? run.dueAt : now,
  createdAt: now,
});

// What fan-out needs from a run — no more. Preview builds one of these
// without persisting anything, which is how the dry run walks the SAME code
// path as the real thing rather than a sympathetic reimplementation of it.
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

  // A write fact CARRIES the row that caused it — minted at the host's
  // write choke point under this reflex's own identity. With no selection
  // declared, that row IS the unit: re-selecting would ask the database a
  // question the fact already answers, and answer it differently if the
  // row has moved. A declared selection is ENRICHMENT — it re-checks
  // reality under the reflex's own principal at fan-out time, which is the
  // guard that makes write-driven chains safe to loop.
  //
  // `preview` passes no fact and `fire`'s manual fact has no row; both fall
  // through to the selection (or the unit-less base), which is what a human
  // rehearsing or forcing a reflex means to ask.
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
