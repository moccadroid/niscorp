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
  Row,
  Task,
  TaskState,
  TideStoreLike,
} from '../types';

// ═══════════════════════════════════════════════════════════════
// The Postgres store
//
// The same contract the memory store implements, held to the same
// tests — which is the point of writing the contract down. Two
// promises are load-bearing and both are real transactions here:
//
//   commitFanout   the tasks and the firing's move to `fanned`
//                  commit together, so a crash mid-fan-out leaves
//                  nothing to resume from
//   recordAttempt  token-fenced, with emitted facts riding the
//                  successful attempt's own transaction
//
// Claims use FOR UPDATE SKIP LOCKED, so N instances ticking at
// once is ordinary contention rather than a lock service.
// ═══════════════════════════════════════════════════════════════

export type SqlResult = { rows: Record<string, unknown>[] };

export type SqlClient = {
  query: (sql: string, params?: readonly unknown[]) => Promise<SqlResult>;
  // Required: the two guarantees above are transactions, not conventions.
  // PGlite exposes this natively; a pg Pool needs a thin wrapper that pins
  // one connection for the callback.
  transaction: <T>(run: (tx: SqlClient) => Promise<T>) => Promise<T>;
};

const DDL = `
CREATE TABLE IF NOT EXISTS tide_fact (
  id           text PRIMARY KEY,
  kind         text NOT NULL,
  entity       text,
  op           text,
  row          jsonb,
  name         text,
  payload      jsonb,
  reflex       text,
  firing_id    text,
  occurrence   text,
  stats        jsonb,
  target       text,
  by_who       text,
  at           bigint NOT NULL,
  not_before   bigint,
  dedupe_key   text,
  cause        text,
  depth        int NOT NULL DEFAULT 0,
  parked       text,
  delivered_at bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS tide_fact_dedupe ON tide_fact (kind, coalesce(name, ''), dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS tide_fact_due ON tide_fact (delivered_at, coalesce(not_before, at)) WHERE delivered_at IS NULL AND parked IS NULL;

CREATE TABLE IF NOT EXISTS tide_delivery (
  fact_id   text NOT NULL,
  reflex_id text NOT NULL,
  outcome   text NOT NULL,
  at        bigint NOT NULL,
  note      text
);
CREATE INDEX IF NOT EXISTS tide_delivery_fact ON tide_delivery (fact_id);

CREATE TABLE IF NOT EXISTS tide_firing (
  id         text PRIMARY KEY,
  reflex_id  text NOT NULL,
  version    text NOT NULL,
  cause      text NOT NULL,
  occurrence text,
  fact_ids   jsonb,
  state      text NOT NULL,
  depth      int NOT NULL DEFAULT 0,
  selected   int,
  total      int NOT NULL DEFAULT 0,
  done       int NOT NULL DEFAULT 0,
  failed     int NOT NULL DEFAULT 0,
  due_at     bigint NOT NULL,
  created_at bigint NOT NULL,
  settled_at bigint,
  drained    boolean NOT NULL DEFAULT false,
  note       text
);
-- The idempotency of materialization: a duplicate occurrence, a second
-- instance's tick, a restarted process all collide here and are refused.
CREATE UNIQUE INDEX IF NOT EXISTS tide_firing_cause ON tide_firing (reflex_id, cause);
CREATE INDEX IF NOT EXISTS tide_firing_pending ON tide_firing (state, due_at);

CREATE TABLE IF NOT EXISTS tide_task (
  id         text PRIMARY KEY,
  firing_id  text NOT NULL,
  reflex_id  text NOT NULL,
  unit       text NOT NULL,
  cause      text NOT NULL,
  env        jsonb NOT NULL,
  state      text NOT NULL,
  attempt    int NOT NULL DEFAULT 0,
  token      text,
  not_before bigint NOT NULL,
  input      jsonb,
  output     jsonb,
  error      text,
  created_at bigint NOT NULL,
  settled_at bigint
);
-- Written BEFORE the effect runs. There is no path to the effect that does
-- not pass through this row.
CREATE UNIQUE INDEX IF NOT EXISTS tide_task_unit ON tide_task (reflex_id, cause, unit);
CREATE INDEX IF NOT EXISTS tide_task_claimable ON tide_task (state, not_before);

CREATE TABLE IF NOT EXISTS tide_attempt (
  id         text PRIMARY KEY,
  task_id    text NOT NULL,
  reflex_id  text NOT NULL,
  n          int NOT NULL,
  token      text NOT NULL,
  started_at bigint NOT NULL,
  ended_at   bigint NOT NULL,
  outcome    text NOT NULL,
  error      text
);
CREATE INDEX IF NOT EXISTS tide_attempt_task ON tide_attempt (task_id);

CREATE TABLE IF NOT EXISTS tide_watermark (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS tide_window (
  id        text PRIMARY KEY,
  reflex_id text NOT NULL,
  key       text NOT NULL,
  fact_ids  jsonb NOT NULL,
  opens_at  bigint NOT NULL,
  closes_at bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS tide_window_open ON tide_window (reflex_id, key);
`;

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
const maybeNum = (value: unknown): number | undefined =>
  value === null || value === undefined ? undefined : Number(value);
const json = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : value);
const jsonRow = (value: unknown): Row | undefined => {
  const parsed = json(value);
  return parsed === null || parsed === undefined || typeof parsed !== 'object' ? undefined : { ...(parsed as Row) };
};

const toFact = (row: Record<string, unknown>): Fact => {
  const stats = json(row.stats);
  return {
    id: String(row.id),
    kind: (text(row.kind) ?? 'write') as Fact['kind'],
    entity: text(row.entity),
    op: text(row.op) as Fact['op'],
    row: jsonRow(row.row),
    name: text(row.name),
    payload: json(row.payload),
    reflex: text(row.reflex),
    firingId: text(row.firing_id),
    occurrence: text(row.occurrence),
    stats: stats === null || stats === undefined ? undefined : (stats as Fact['stats']),
    target: text(row.target),
    by: text(row.by_who),
    at: num(row.at),
    notBefore: maybeNum(row.not_before),
    dedupeKey: text(row.dedupe_key),
    cause: text(row.cause),
    depth: num(row.depth),
    parked: text(row.parked),
  };
};

const toFiring = (row: Record<string, unknown>): Firing => {
  const factIds = json(row.fact_ids);
  return {
    id: String(row.id),
    reflexId: String(row.reflex_id),
    version: String(row.version),
    cause: String(row.cause),
    occurrence: text(row.occurrence),
    factIds: Array.isArray(factIds) ? factIds.map(String) : undefined,
    state: (text(row.state) ?? 'pending') as Firing['state'],
    depth: num(row.depth),
    selected: maybeNum(row.selected),
    total: num(row.total),
    done: num(row.done),
    failed: num(row.failed),
    dueAt: num(row.due_at),
    createdAt: num(row.created_at),
    settledAt: maybeNum(row.settled_at),
    note: text(row.note),
  };
};

const toTask = (row: Record<string, unknown>): Task => ({
  id: String(row.id),
  firingId: String(row.firing_id),
  reflexId: String(row.reflex_id),
  unit: String(row.unit),
  cause: String(row.cause),
  env: jsonRow(row.env) ?? {},
  state: (text(row.state) ?? 'pending') as TaskState,
  attempt: num(row.attempt),
  token: text(row.token),
  notBefore: num(row.not_before),
  input: json(row.input),
  output: json(row.output),
  error: text(row.error),
  createdAt: num(row.created_at),
  settledAt: maybeNum(row.settled_at),
});

const toAttempt = (row: Record<string, unknown>): Attempt => ({
  id: String(row.id),
  taskId: String(row.task_id),
  reflexId: String(row.reflex_id),
  n: num(row.n),
  token: String(row.token),
  startedAt: num(row.started_at),
  endedAt: num(row.ended_at),
  outcome: (text(row.outcome) ?? 'ok') as Attempt['outcome'],
  error: text(row.error),
});

const pack = (value: unknown): string | null => (value === undefined ? null : JSON.stringify(value));

export type PostgresStoreOptions = {
  // Ids are generated in JS so the store needs no extension and behaves the
  // same on PGlite, where gen_random_uuid may be absent.
  newId?: (prefix: string) => string;
};

export const createPostgresStore = (client: SqlClient, options?: PostgresStoreOptions): TideStoreLike & { ready: Promise<void> } => {
  const ready = client.query(DDL).then(() => undefined);

  let counter = 0;
  const newId =
    options?.newId ??
    ((prefix: string): string => {
      counter += 1;
      return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    });

  const q = async (sql: string, params: readonly unknown[] = []): Promise<SqlResult> => {
    await ready;
    return client.query(sql, params);
  };

  const insertFact = async (fact: NewFact): Promise<Fact | undefined> => {
    const id = newId('fact');
    const result = await q(
      `INSERT INTO tide_fact (id, kind, entity, op, row, name, payload, reflex, firing_id, occurrence, stats, target, by_who, at, not_before, dedupe_key, cause, depth)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT DO NOTHING RETURNING *`,
      [
        id,
        fact.kind,
        fact.entity ?? null,
        fact.op ?? null,
        pack(fact.row),
        fact.name ?? null,
        pack(fact.payload),
        fact.reflex ?? null,
        fact.firingId ?? null,
        fact.occurrence ?? null,
        pack(fact.stats),
        fact.target ?? null,
        fact.by ?? null,
        fact.at,
        fact.notBefore ?? null,
        fact.dedupeKey ?? null,
        fact.cause ?? null,
        fact.depth,
      ],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : toFact(row);
  };

  const store: TideStoreLike & { ready: Promise<void> } = {
    ready,
    insertFact,

    dueFacts: async (now, limit) => {
      const result = await q(
        `SELECT * FROM tide_fact
         WHERE delivered_at IS NULL AND parked IS NULL AND coalesce(not_before, at) <= $1
         ORDER BY coalesce(not_before, at) ASC LIMIT $2`,
        [now, limit],
      );
      return result.rows.map(toFact);
    },

    recordDelivery: async (delivery: Delivery) => {
      await q(`INSERT INTO tide_delivery (fact_id, reflex_id, outcome, at, note) VALUES ($1,$2,$3,$4,$5)`, [
        delivery.factId,
        delivery.reflexId,
        delivery.outcome,
        delivery.at,
        delivery.note ?? null,
      ]);
    },

    completeFact: async (factId, at) => {
      await q(`UPDATE tide_fact SET delivered_at = $2 WHERE id = $1`, [factId, at]);
    },

    parkFact: async (factId, reason) => {
      await q(`UPDATE tide_fact SET parked = $2 WHERE id = $1`, [factId, reason]);
    },

    releaseFact: async (factId) => {
      const result = await q(`UPDATE tide_fact SET parked = NULL WHERE id = $1 AND parked IS NOT NULL RETURNING id`, [factId]);
      return result.rows.length > 0;
    },

    getFact: async (factId) => {
      const result = await q(`SELECT * FROM tide_fact WHERE id = $1`, [factId]);
      const row = result.rows[0];
      return row === undefined ? undefined : toFact(row);
    },

    listFacts: async (filter) => {
      const result =
        filter?.reflexId === undefined
          ? await q(`SELECT * FROM tide_fact ORDER BY at DESC LIMIT $1`, [filter?.limit ?? 200])
          : await q(`SELECT * FROM tide_fact WHERE reflex = $1 OR target = $1 ORDER BY at DESC LIMIT $2`, [
              filter.reflexId,
              filter.limit ?? 200,
            ]);
      return result.rows.map(toFact);
    },

    createFiring: async (firing) => {
      const id = newId('fir');
      const result = await q(
        `INSERT INTO tide_firing (id, reflex_id, version, cause, occurrence, fact_ids, state, depth, selected, total, done, failed, due_at, created_at, settled_at, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (reflex_id, cause) DO NOTHING RETURNING *`,
        [
          id,
          firing.reflexId,
          firing.version,
          firing.cause,
          firing.occurrence ?? null,
          pack(firing.factIds),
          firing.state,
          firing.depth,
          firing.selected ?? null,
          firing.total,
          firing.done,
          firing.failed,
          firing.dueAt,
          firing.createdAt,
          firing.settledAt ?? null,
          firing.note ?? null,
        ],
      );
      const row = result.rows[0];
      return row === undefined ? undefined : toFiring(row);
    },

    patchFiring: async (id, patch) => {
      const sets: string[] = [];
      const params: unknown[] = [id];
      const push = (column: string, value: unknown): void => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      };
      if (patch.state !== undefined) push('state', patch.state);
      if (patch.selected !== undefined) push('selected', patch.selected);
      if (patch.total !== undefined) push('total', patch.total);
      if (patch.done !== undefined) push('done', patch.done);
      if (patch.failed !== undefined) push('failed', patch.failed);
      if (patch.settledAt !== undefined) push('settled_at', patch.settledAt);
      if (patch.note !== undefined) push('note', patch.note);
      if (sets.length === 0) return;
      await q(`UPDATE tide_firing SET ${sets.join(', ')} WHERE id = $1`, params);
    },

    getFiring: async (id) => {
      const result = await q(`SELECT * FROM tide_firing WHERE id = $1`, [id]);
      const row = result.rows[0];
      return row === undefined ? undefined : toFiring(row);
    },

    unsettledFiring: async (reflexId) => {
      const result = await q(
        `SELECT * FROM tide_firing WHERE reflex_id = $1 AND state IN ('pending','fanned') ORDER BY created_at ASC LIMIT 1`,
        [reflexId],
      );
      const row = result.rows[0];
      return row === undefined ? undefined : toFiring(row);
    },

    pendingFirings: async (limit) => {
      const result = await q(`SELECT * FROM tide_firing WHERE state = 'pending' ORDER BY due_at ASC LIMIT $1`, [limit]);
      return result.rows.map(toFiring);
    },

    listFirings: async (filter) => {
      const result =
        filter?.reflexId === undefined
          ? await q(`SELECT * FROM tide_firing ORDER BY created_at DESC LIMIT $1`, [filter?.limit ?? 200])
          : await q(`SELECT * FROM tide_firing WHERE reflex_id = $1 ORDER BY created_at DESC LIMIT $2`, [
              filter.reflexId,
              filter.limit ?? 200,
            ]);
      return result.rows.map(toFiring);
    },

    // ATOMIC. See the header: a resumable partial fan-out would re-select
    // against moved data, which for a billing run means charging someone who
    // already paid.
    commitFanout: async (firingId, tasks, selected) =>
      client.transaction(async (tx) => {
        const guard = await tx.query(`SELECT state, due_at FROM tide_firing WHERE id = $1 FOR UPDATE`, [firingId]);
        const current = guard.rows[0];
        if (current === undefined || text(current.state) !== 'pending') return 0;

        for (const task of tasks)
          await tx.query(
            `INSERT INTO tide_task (id, firing_id, reflex_id, unit, cause, env, state, attempt, not_before, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
            [
              newId('task'),
              firingId,
              task.reflexId,
              task.unit,
              task.cause,
              pack(task.env),
              task.state,
              task.attempt,
              task.notBefore,
              task.createdAt,
            ],
          );

        const empty = tasks.length === 0;
        await tx.query(
          `UPDATE tide_firing SET state = $2, selected = $3, total = $4, settled_at = $5 WHERE id = $1`,
          [firingId, empty ? 'settled' : 'fanned', selected, tasks.length, empty ? num(current.due_at) : null],
        );
        return tasks.length;
      }),

    claimTasks: async (opts: ClaimOptions) => {
      const serial = opts.serialReflexIds;
      const result = await client.transaction(async (tx) => {
        // SKIP LOCKED is what makes N instances ordinary contention rather
        // than a lock service.
        const candidates = await tx.query(
          `SELECT t.* FROM tide_task t
             JOIN tide_firing f ON f.id = t.firing_id
            WHERE t.state IN ('pending','retrying') AND t.not_before <= $1 AND f.state = 'fanned'
            ORDER BY t.not_before ASC, t.created_at ASC
            LIMIT $2
            FOR UPDATE OF t SKIP LOCKED`,
          [opts.now, opts.limit],
        );

        const claimed: Task[] = [];
        const takenSerial = new Set<string>();
        if (serial.length > 0) {
          const busy = await tx.query(
            `SELECT DISTINCT reflex_id FROM tide_task WHERE state = 'claimed' AND reflex_id = ANY($1)`,
            [serial],
          );
          for (const row of busy.rows) takenSerial.add(String(row.reflex_id));
        }

        for (const raw of candidates.rows) {
          const task = toTask(raw);
          if (serial.includes(task.reflexId)) {
            if (takenSerial.has(task.reflexId)) continue;
            takenSerial.add(task.reflexId);
          }
          const token = newId('tok');
          await tx.query(`UPDATE tide_task SET state = 'claimed', token = $2, attempt = attempt + 1 WHERE id = $1`, [
            task.id,
            token,
          ]);
          claimed.push({ ...task, state: 'claimed', token, attempt: task.attempt + 1 });
        }
        return claimed;
      });
      return result;
    },

    // TOKEN-FENCED, and the emits ride this transaction.
    recordAttempt: async (taskId, token, result: RecordResult) =>
      client.transaction(async (tx) => {
        const found = await tx.query(`SELECT * FROM tide_task WHERE id = $1 FOR UPDATE`, [taskId]);
        const raw = found.rows[0];
        if (raw === undefined) return false;
        const task = toTask(raw);
        if (task.token !== token) return false;

        await tx.query(
          `INSERT INTO tide_attempt (id, task_id, reflex_id, n, token, started_at, ended_at, outcome, error)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [newId('att'), taskId, task.reflexId, task.attempt, token, task.createdAt, result.at, result.outcome, result.error ?? null],
        );

        const settles = result.next.state === 'done' || result.next.state === 'failed';
        await tx.query(
          `UPDATE tide_task SET state = $2, token = NULL, output = $3, error = $4, not_before = $5, settled_at = $6 WHERE id = $1`,
          [
            taskId,
            result.next.state,
            pack(result.output),
            result.error ?? null,
            result.next.state === 'retrying' ? result.next.notBefore : task.notBefore,
            settles ? result.at : null,
          ],
        );

        if (result.outcome === 'ok')
          for (const emit of result.emits)
            await tx.query(
              `INSERT INTO tide_fact (id, kind, entity, op, row, name, payload, reflex, firing_id, occurrence, stats, target, by_who, at, not_before, dedupe_key, cause, depth)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT DO NOTHING`,
              [
                newId('fact'),
                emit.kind,
                emit.entity ?? null,
                emit.op ?? null,
                pack(emit.row),
                emit.name ?? null,
                pack(emit.payload),
                emit.reflex ?? null,
                emit.firingId ?? null,
                emit.occurrence ?? null,
                pack(emit.stats),
                emit.target ?? null,
                emit.by ?? null,
                emit.at,
                emit.notBefore ?? null,
                emit.dedupeKey ?? null,
                emit.cause ?? null,
                emit.depth,
              ],
            );

        if (settles)
          await tx.query(
            `UPDATE tide_firing
                SET done = done + $2, failed = failed + $3,
                    state = CASE WHEN done + $2 + failed + $3 >= total AND settled_at IS NULL THEN 'settled' ELSE state END,
                    settled_at = CASE WHEN done + $2 + failed + $3 >= total AND settled_at IS NULL THEN $4 ELSE settled_at END
              WHERE id = $1`,
            [task.firingId, result.next.state === 'done' ? 1 : 0, result.next.state === 'failed' ? 1 : 0, result.at],
          );

        return true;
      }),

    getTask: async (id) => {
      const result = await q(`SELECT * FROM tide_task WHERE id = $1`, [id]);
      const row = result.rows[0];
      return row === undefined ? undefined : toTask(row);
    },

    listTasks: async (filter) => {
      const clauses: string[] = [];
      const params: unknown[] = [];
      const add = (clause: string, value: unknown): void => {
        params.push(value);
        clauses.push(clause.replace('?', `$${params.length}`));
      };
      if (filter?.firingId !== undefined) add('firing_id = ?', filter.firingId);
      if (filter?.reflexId !== undefined) add('reflex_id = ?', filter.reflexId);
      if (filter?.state !== undefined) add('state = ?', filter.state);
      params.push(filter?.limit ?? 500);
      const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
      const result = await q(`SELECT * FROM tide_task ${where} ORDER BY created_at ASC LIMIT $${params.length}`, params);
      return result.rows.map(toTask);
    },

    listAttempts: async (taskId) => {
      const result = await q(`SELECT * FROM tide_attempt WHERE task_id = $1 ORDER BY n ASC`, [taskId]);
      return result.rows.map(toAttempt);
    },

    // Does not rewind the firing: a digest already went out saying twelve
    // failed, and re-settling would send it again.
    reopenTask: async (taskId, now) => {
      const result = await q(
        `UPDATE tide_task SET state = 'pending', not_before = $2, error = NULL, settled_at = NULL
          WHERE id = $1 AND state = 'failed' RETURNING *`,
        [taskId, now],
      );
      const row = result.rows[0];
      return row === undefined ? undefined : toTask(row);
    },

    // Exactly-once by the `drained` flag: two instances cannot both mint the
    // firing fact that fan-in depends on.
    drainSettled: async () => {
      const result = await q(
        `UPDATE tide_firing SET drained = true WHERE state = 'settled' AND drained = false RETURNING *`,
      );
      return result.rows.map(toFiring);
    },

    getWatermark: async (reflexId) => {
      const result = await q(`SELECT value FROM tide_watermark WHERE key = $1`, [reflexId]);
      const row = result.rows[0];
      return row === undefined ? undefined : String(row.value);
    },

    setWatermark: async (reflexId, value) => {
      await q(
        `INSERT INTO tide_watermark (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [reflexId, value],
      );
    },

    appendCoalesce: async (reflexId, key, factId, now, windowMs) => {
      await q(
        `INSERT INTO tide_window (id, reflex_id, key, fact_ids, opens_at, closes_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (reflex_id, key) DO UPDATE SET fact_ids = tide_window.fact_ids || EXCLUDED.fact_ids`,
        [newId('win'), reflexId, key, JSON.stringify([factId]), now, now + windowMs],
      );
    },

    claimClosedWindows: async (now) => {
      const result = await q(`DELETE FROM tide_window WHERE closes_at <= $1 RETURNING *`, [now]);
      return result.rows.map((row): CoalesceWindow => {
        const ids = json(row.fact_ids);
        return {
          id: String(row.id),
          reflexId: String(row.reflex_id),
          key: String(row.key),
          factIds: Array.isArray(ids) ? ids.map(String) : [],
          opensAt: num(row.opens_at),
          closesAt: num(row.closes_at),
        };
      });
    },

    sweep: async (now, retention: Retention) => {
      let removed = 0;
      const drop = async (sql: string, horizon: number | undefined): Promise<void> => {
        if (horizon === undefined) return;
        const result = await q(sql, [now - horizon]);
        removed += result.rows.length;
      };
      await drop(`DELETE FROM tide_attempt WHERE ended_at < $1 RETURNING id`, retention.attempts);
      await drop(`DELETE FROM tide_task WHERE settled_at IS NOT NULL AND settled_at < $1 RETURNING id`, retention.tasks);
      await drop(`DELETE FROM tide_firing WHERE settled_at IS NOT NULL AND settled_at < $1 RETURNING id`, retention.firings);
      await drop(`DELETE FROM tide_fact WHERE delivered_at IS NOT NULL AND delivered_at < $1 RETURNING id`, retention.facts);
      return removed;
    },
  };

  return store;
};
