// ═══════════════════════════════════════════════════════════════
// IDENTITY — the one read that cannot be authorised, held once.
//
// A vex read needs a compiled ScopePolicy; a policy is compiled from a
// principal's roles; roles come from identity. The read that RESOLVES a
// principal therefore cannot be authorised, because authorisation needs its
// answer. Every system has this, and it is the only honest reason for a lookup
// that does not pass through the engine (DESIGN Part 4).
//
// What that licenses is exactly one row, on demand, for the principal
// presenting a token. It does not license a resident copy of the population,
// which is what six synchronous seams forced on Lyra: a hook that cannot await
// has exactly one implementation available to it, and that implementation is a
// map of everybody.
//
// So the seam is async, and the cache lives HERE rather than in eight
// module-level maps across three application files. Moss already holds four
// per-principal caches of compiled objects it never interprets; this is that
// responsibility, held with bounds and a roster it did not have.
//
// WHAT THIS DELIBERATELY DOES NOT HAVE:
//
//   - an enumerator for application code. `get` takes a principal and returns
//     one record. There is no `everyone()`, because size was never what made
//     the directory a database — being listable was. You cannot scan what you
//     cannot list. `list()` below is an OPERATOR surface, on the same model as
//     the shell roster, and it returns structural facts rather than records.
//   - a secondary index. No by-email, no by-tenant. A second index is a query
//     planner, and a query planner is a database.
//   - any inspection of what it holds. Not one line here reads a field off a
//     record's `scope`. The moment moss says `.studioId`, moss has learned what
//     a tenant is and the boundary this whole design rests on is gone.
// ═══════════════════════════════════════════════════════════════

// What an application says a principal IS. Opaque: `roles` goes to charter,
// `installed` is filtered against, `scope` is merged into vex's scope values
// without moss ever looking inside it.
export type IdentityRecord = {
  // The rungs this principal wears. Charter compiles a policy from them.
  roles: readonly string[];
  // Everything else a principal is — a tenant, a region, a locale. Merged into
  // the engine's scope values server-side and unforgeable by a request.
  scope: Record<string, unknown>;
  // Integration ids live for this principal's tenant. `undefined` means every
  // registered integration is live, which is right for a single-tenant app and
  // wrong the moment there are two.
  installed?: readonly string[];
};

// One resident identity, as an operator needs to see it: structural facts only.
// Naming the principal is the application's job, and what the record CONTAINS
// is never any of moss's business.
export type IdentityReport = {
  principal: string;
  // when this record was last resolved from the application
  since: number;
  // when it was last read; the idle sweep works off this
  lastSeen: number;
};

export type IdentityCache = {
  // THE ONLY WAY IN. One principal, one record.
  get: (principal: string) => Promise<IdentityRecord>;
  // Forget one principal. `false` if they were not held — an answer, not an
  // error. Called wherever a shell is reset today: a role change, a language
  // change, an install landing.
  invalidate: (principal: string) => boolean;
  // Forget everybody. The generation pointer moved, or an artifact changed
  // under the whole deployment.
  invalidateAll: () => void;
  // Every identity resident right now — the operator roster, on the shell-list
  // model. Structural facts, never records.
  list: () => IdentityReport[];
  // What it is costing, so that "breaks rather than degrades" has something to
  // break on: an unbounded map works beautifully at demo scale and dies at
  // production scale with no signal in between. This is the signal.
  meter: () => { size: number; max: number; resolved: number; evicted: number; expired: number };
  // Stop the sweep. For hosts that outlive their server (dev checks, embedded
  // tools); the timer is unref'd, so a plain process needn't call it.
  stop: () => void;
};

export type IdentityCacheContext = {
  // The application's seam: one principal in, one record out. Async and
  // wire-bearing at the call site — this module never sees the wire, it only
  // sees the promise.
  resolve: (principal: string) => Promise<IdentityRecord>;
  // Hard ceiling on resident records. Reaching it evicts the least recently
  // read, and increments the eviction meter so that pressure is visible before
  // it is fatal.
  max?: number;
  // Drop a record nobody has read for this long. `0` disables the sweep.
  idleMs?: number;
  // Re-resolve a record older than this on its next read. `0` disables it.
  // The same clock and the same reasoning as `sessionRevalidateMs`: a verifier
  // whose answers can change needs its answers to expire.
  revalidateMs?: number;
  // Injected so the sweep and the clock are testable without waiting.
  now?: () => number;
};

// Big enough that no real deployment reaches it by accident, small enough that
// a leak announces itself long before the process dies. A deployment with more
// concurrent sessions than this is a deployment that should have said so.
export const DEFAULT_IDENTITY_MAX = 10_000;

// A record nobody has read for half an hour is a warm answer with no reader.
// Re-resolving costs one round trip on their next request. Same number and same
// reasoning as the durable-shell sweep.
export const DEFAULT_IDENTITY_IDLE_MS = 30 * 60 * 1000;

// The sweep never runs less often than this, so a short `idleMs` is honoured
// closely and a long one doesn't cost a wakeup per minute.
const SWEEP_EVERY_MS = 60 * 1000;

export const createIdentityCache = (ctx: IdentityCacheContext): IdentityCache => {
  const max = ctx.max ?? DEFAULT_IDENTITY_MAX;
  const idleMs = ctx.idleMs ?? DEFAULT_IDENTITY_IDLE_MS;
  const revalidateMs = ctx.revalidateMs ?? 0;
  const now = ctx.now ?? Date.now;

  type Held = {
    record: IdentityRecord;
    since: number;
    lastSeen: number;
  };

  // Insertion order IS the eviction order, and a Map preserves it — so
  // "least recently read" is maintained by deleting and re-setting on every
  // read rather than by a second structure that could disagree with this one.
  const held = new Map<string, Held>();

  // IN FLIGHT, so that a burst of requests for one principal at login resolves
  // ONCE. Without this the first request's latency is paid by every request
  // that arrives while it is outstanding, which is precisely the moment a
  // browser opens six connections at once.
  const pending = new Map<string, Promise<IdentityRecord>>();

  let resolved = 0;
  let evicted = 0;
  let expired = 0;

  const evictOldest = (): void => {
    const oldest = held.keys().next();
    if (oldest.done === true) return;
    held.delete(oldest.value);
    evicted += 1;
  };

  const remember = (principal: string, record: IdentityRecord, at: number): void => {
    held.delete(principal);
    // Evict AFTER the delete above, so re-resolving somebody already held never
    // evicts a stranger to make room for a record that needs none.
    while (held.size >= max) evictOldest();
    held.set(principal, { record, since: at, lastSeen: at });
  };

  const get = async (principal: string): Promise<IdentityRecord> => {
    const at = now();
    const hit = held.get(principal);
    if (hit !== undefined) {
      const stale = revalidateMs > 0 && at - hit.since >= revalidateMs;
      if (!stale) {
        // Re-set to move it to the young end of the eviction order.
        held.delete(principal);
        hit.lastSeen = at;
        held.set(principal, hit);
        return hit.record;
      }
      expired += 1;
    }

    const inFlight = pending.get(principal);
    if (inFlight !== undefined) return inFlight;

    const work = ctx
      .resolve(principal)
      .then((record) => {
        resolved += 1;
        remember(principal, record, now());
        return record;
      })
      .finally(() => {
        pending.delete(principal);
      });
    pending.set(principal, work);
    return work;
  };

  // The idle sweep. Unref'd: a warm cache with no reader must not be the reason
  // a process refuses to exit.
  const sweep = idleMs > 0 ? setInterval(() => {
    const at = now();
    for (const [principal, entry] of [...held]) {
      if (at - entry.lastSeen >= idleMs) {
        held.delete(principal);
        evicted += 1;
      }
    }
  }, Math.min(SWEEP_EVERY_MS, idleMs)) : undefined;
  sweep?.unref?.();

  return {
    get,
    invalidate: (principal) => {
      pending.delete(principal);
      return held.delete(principal);
    },
    invalidateAll: () => {
      held.clear();
      pending.clear();
    },
    list: () => [...held].map(([principal, entry]) => ({ principal, since: entry.since, lastSeen: entry.lastSeen })),
    meter: () => ({ size: held.size, max, resolved, evicted, expired }),
    stop: () => {
      if (sweep !== undefined) clearInterval(sweep);
    },
  };
};
