import type { PgPool } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// THE GENERATION POINTER — how a second process finds out.
//
// Every per-principal resolution in this server is derived from rows: which
// integrations a tenant has installed, what rung somebody stands on, what a
// studio's theme is. A write changes those rows and the writing process drops
// its memos. Every OTHER process goes on serving the old answer until it is
// restarted, which at two processes is a correctness bug rather than a scaling
// concern: a pack installed via A leaves B refusing that pack's keyed calls,
// and nothing says so.
//
// This is a counter and a clock, deliberately, and NOT `LISTEN/NOTIFY`:
//
//   - `NiscRuntime` takes a pool and a mutation client, both abstract. LISTEN
//     needs a raw dedicated connection held outside the pool for the life of
//     the process — a new capability at the environment boundary, for one
//     feature.
//   - A dropped listener stops invalidating and says nothing. That is a SILENT
//     correctness failure, which is the failure mode this whole design refuses
//     ("breaks rather than degrades"). A counter that cannot be read raises.
//   - It converges on where the plan is going instead of being thrown away by
//     it: "a new generation is a new manifest, and other processes observe a
//     pointer move" (moss DESIGN.md) IS this counter, and Move 4 replaces what
//     the pointer points AT rather than the mechanism.
//
// The cost is that staleness is bounded by a poll rather than instant. It is
// bounded by `sessionRevalidateMs`, a knob already being tuned for exactly this
// class of question. Today it is bounded by nothing.
// ═══════════════════════════════════════════════════════════════

export type Generation = {
  /** This process changed something every process should forget. */
  bump: () => void;
  /** The generation last observed — for checks and operator surfaces. */
  current: () => number;
  stop: () => void;
};

// TWO STATEMENTS, SENT SEPARATELY. A driver that prepares its statements refuses
// a string carrying more than one command, and the failure arrives as a
// DatabaseError at boot rather than as anything about generations.
export const GENERATION_DDL: readonly string[] = [
  /* sql */ `CREATE TABLE IF NOT EXISTS moss_generation (id INT PRIMARY KEY, n BIGINT NOT NULL DEFAULT 0)`,
  /* sql */ `INSERT INTO moss_generation (id, n) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`,
];

export const DEFAULT_GENERATION_POLL_MS = 60 * 1000;

export const createGeneration = (
  pool: PgPool,
  ctx: { onMoved: () => void | Promise<void>; everyMs?: number },
): Generation => {
  const everyMs = ctx.everyMs ?? DEFAULT_GENERATION_POLL_MS;
  // Starts at -1 rather than 0 so the first read establishes a baseline instead
  // of reporting a move that never happened.
  let seen = -1;
  let checking = false;

  const read = async (): Promise<void> => {
    // Never two reads at once: a poll that outlives its interval would otherwise
    // stack, and a stacked poll on a slow database is how a timer becomes a
    // load generator.
    if (checking) return;
    checking = true;
    try {
      const result = await pool.query('SELECT n FROM moss_generation WHERE id = 1');
      const n = Number((result.rows[0] as { n?: unknown } | undefined)?.n ?? 0);
      if (!Number.isFinite(n)) return;
      const first = seen === -1;
      const moved = !first && n !== seen;
      seen = n;
      if (moved) await ctx.onMoved();
    } catch (err) {
      // LOUD. A counter nobody can read means this process has stopped hearing
      // about other processes' writes, which is precisely the condition the
      // whole mechanism exists to prevent. Silence here would reproduce the bug
      // in the shape of its own fix.
      console.error('[moss:generation] could not read the generation pointer — this process may be serving stale resolutions', err);
    } finally {
      checking = false;
    }
  };

  void read();
  const timer = everyMs > 0 ? setInterval(() => void read(), everyMs) : undefined;
  timer?.unref?.();

  return {
    bump: () => {
      void pool
        .query('UPDATE moss_generation SET n = n + 1 WHERE id = 1')
        .then(async () => {
          // Adopt our own bump immediately, so `seen` cannot lag behind a value
          // this process itself wrote and then "discover" it a minute later.
          const result = await pool.query('SELECT n FROM moss_generation WHERE id = 1');
          seen = Number((result.rows[0] as { n?: unknown } | undefined)?.n ?? seen);
        })
        .catch((err: unknown) => console.error('[moss:generation] could not move the pointer', err));
    },
    current: () => seen,
    stop: () => {
      if (timer !== undefined) clearInterval(timer);
    },
  };
};
