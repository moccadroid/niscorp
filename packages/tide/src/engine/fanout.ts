import { pollOf } from '../schemas';
import { TideError } from '../errors';
import type { Fact, Firing, Row, Task } from '../types';
import { buildEnv, evaluateTemplate } from './runtime';
import type { EngineDeps, LoadedReflex } from './runtime';

// ═══════════════════════════════════════════════════════════════
// Fan out — a firing becomes unit tasks
//
// Transactional, and that is the whole point. A fan-out that
// crashed at row 200 of 500 and RESUMED would re-select against
// moved data: a member who paid in the gap keeps a task minted
// from the stale pass. Committing the tasks with the firing's
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
    // A duplicate unit key means the firing's GRAIN is wrong. ON CONFLICT
    // would eat the second row silently; an authoring error is loud or it
    // is invisible.
    if (seen.has(unit))
      throw new TideError('duplicate_unit', `${reflexId}: duplicate unit key "${unit}" — the selection's unitKey is not unique`);
    seen.add(unit);
    return { unit, env: { ...base, row } };
  });
};

const factRowsOf = async (deps: EngineDeps, firing: Firing): Promise<readonly Fact[]> => {
  const ids = firing.factIds ?? [];
  const found: Fact[] = [];
  for (const id of ids) {
    const fact = await deps.store.getFact(id);
    if (fact !== undefined) found.push(fact);
  }
  return found;
};

export const fanOut = async (deps: EngineDeps, now: number, limit: number): Promise<number> => {
  let created = 0;

  for (const firing of await deps.store.pendingFirings(limit)) {
    const loaded = deps.find(firing.reflexId);
    if (loaded === undefined) {
      await deps.store.patchFiring(firing.id, { state: 'skipped', settledAt: now, note: 'reflex is no longer loaded' });
      continue;
    }

    try {
      const facts = await factRowsOf(deps, firing);
      const units = await unitsForFiring(deps, loaded, shapeOf(firing), facts, now);
      const committed = await deps.store.commitFanout(
        firing.id,
        units.map((unit) => taskOf(unit, firing, loaded, now)),
        units.length,
      );
      created += committed;
    } catch (error) {
      await deps.store.patchFiring(firing.id, {
        state: 'skipped',
        settledAt: now,
        note: `fan-out failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      deps.emit({ type: 'firing.skipped', reflexId: firing.reflexId, reason: 'fan-out failed' });
    }
  }

  return created;
};

const taskOf = (unit: Unit, firing: Firing, loaded: LoadedReflex, now: number): Omit<Task, 'id'> => ({
  firingId: firing.id,
  reflexId: loaded.reflex.id,
  unit: unit.unit,
  // UNIQUE(reflex, cause, unit) — the idempotency grain, written BEFORE the
  // effect runs. There is no path to the effect that skips this row.
  cause: firing.cause,
  env: unit.env,
  state: 'pending',
  attempt: 0,
  notBefore: firing.dueAt > now ? firing.dueAt : now,
  createdAt: now,
});

// What fan-out needs from a firing — no more. Preview builds one of these
// without persisting anything, which is how the dry run walks the SAME code
// path as the real thing rather than a sympathetic reimplementation of it.
export type FiringShape = { cause: string; occurrence?: string; dueAt: number };

const shapeOf = (firing: Firing): FiringShape => ({
  cause: firing.cause,
  occurrence: firing.occurrence,
  dueAt: firing.dueAt,
});

export const unitsForFiring = async (
  deps: EngineDeps,
  loaded: LoadedReflex,
  firing: FiringShape,
  facts: readonly Fact[],
  now: number,
): Promise<Unit[]> => {
  const { reflex } = loaded;
  const batched = firing.cause.startsWith('window:');

  const base = buildEnv({
    params: reflex.params,
    occurrence: firing.occurrence === undefined ? undefined : { key: firing.occurrence, at: firing.dueAt },
    fact: !batched && facts.length === 1 ? { ...facts[0] } : undefined,
    facts: batched || facts.length > 1 ? facts.map((fact) => ({ ...fact })) : undefined,
    now,
  });

  // A poll reflex's `select` IS the polled query — it already ran, and the
  // row it produced is the unit. Re-selecting here would ask the source the
  // same question twice and answer it differently.
  const poll = pollOf(reflex.on);
  if (poll !== undefined) {
    const rows = facts.map((fact) => fact.row).filter((row): row is Row => row !== undefined);
    return unitsFrom(rows, reflex.select?.unitKey, base, reflex.id);
  }

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
