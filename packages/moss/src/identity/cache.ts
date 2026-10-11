// ═══════════════════════════════════════════════════════════════
// IDENTITY — the one read that cannot be authorised, held once.
//
// A vex read needs a compiled ScopePolicy; a policy is compiled from a
// principal's roles; roles come from identity. The read that RESOLVES a
// principal therefore cannot be authorised, because authorisation needs its
// answer. Every system has this, and it is the only honest reason for a lookup
// that does not pass through the engine.
//
// What that licenses is exactly one row, on demand, for the principal
// presenting a token. It does not license a resident copy of the population:
// a hook that cannot await has exactly one implementation available to it, and
// that implementation is a map of everybody.
//
// So the seam is async, and the cache lives HERE, held with bounds and an
// operator roster.
//
// WHAT THIS DELIBERATELY DOES NOT HAVE:
//
//   - an enumerator for application code. `get` takes a principal and returns
//     one record. There is no `everyone()`, because being listable is what
//     makes a directory a database, not its size. You cannot scan what you
//     cannot list. `list()` below is an OPERATOR surface, on the same model as
//     the shell roster, and it returns structural facts rather than records.
//   - a secondary index you can READ through. No by-email, no by-tenant lookup.
//     A second index that answers "who is X" is a query planner, and a query
//     planner is a database. The tag map below is the one exception and it is
//     write-only: it can forget a group, and it cannot return one.
//   - any inspection of what it holds. Not one line here reads a field off a
//     record's `scope`. The moment moss says `.studioId`, moss has learned what
//     a tenant is and the boundary this whole design rests on is gone.
// ═══════════════════════════════════════════════════════════════

import type { IdentityRecord } from './record';

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
  // error. Called wherever a shell is reset: a role change, a language change,
  // an install landing.
  invalidate: (principal: string) => boolean;
  // Forget everybody. The generation pointer moved, or an artifact changed
  // under the whole deployment.
  invalidateAll: () => void;
  // Forget everybody who shares a tag — one tenant, not the deployment. Answers
  // WHO was forgotten, because the caller's next move is to reset exactly those
  // shells: a count would leave it guessing, and guessing here means resetting
  // the whole deployment to be safe, which is the thing this exists to stop.
  invalidateTag: (tag: string) => readonly string[];
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
  // it is fatal. Zero or less is refused: there is no room to hold anybody.
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
// Re-resolving costs one round trip on their next request.
export const DEFAULT_IDENTITY_IDLE_MS = 30 * 60 * 1000;

// The sweep never runs less often than this, so a short `idleMs` is honoured
// closely and a long one doesn't cost a wakeup per minute.
const SWEEP_EVERY_MS = 60 * 1000;

type Held = {
  record: IdentityRecord;
  since: number;
  lastSeen: number;
};

// WHAT IS HELD: the records, and which principals wear which tag. Apart from
// the reading and re-resolving below, so that each is one thing.
const createHeldRecords = (max: number) => {
  // Insertion order IS the eviction order, and a Map preserves it — so
  // "least recently read" is maintained by deleting and re-setting on every
  // read rather than by a second structure that could disagree with this one.
  const held = new Map<string, Held>();

  // tag -> the principals wearing it. Maintained beside `held` and never read
  // out of: `forgetTag` deletes through it and nothing else touches it.
  // Kept honest by pruning on every removal, so a tag whose last principal was
  // evicted does not linger as an empty set.
  const tagged = new Map<string, Set<string>>();

  let evicted = 0;

  const untag = (principal: string, record: IdentityRecord): void => {
    const tag = record.tag;
    if (tag === undefined) return;
    const group = tagged.get(tag);
    if (group === undefined) return;
    group.delete(principal);
    if (group.size === 0) tagged.delete(tag);
  };

  const forget = (principal: string): boolean => {
    const entry = held.get(principal);
    if (entry === undefined) return false;
    untag(principal, entry.record);
    held.delete(principal);
    return true;
  };

  const evictOldest = (): void => {
    const oldest = held.keys().next();
    if (oldest.done === true) return;
    forget(oldest.value);
    evicted += 1;
  };

  const remember = (principal: string, record: IdentityRecord, at: number): void => {
    forget(principal);
    // Evict AFTER the delete above, so re-resolving somebody already held never
    // evicts a stranger to make room for a record that needs none.
    while (held.size >= max) evictOldest();
    held.set(principal, { record, since: at, lastSeen: at });
    if (record.tag !== undefined) {
      const group = tagged.get(record.tag) ?? new Set<string>();
      group.add(principal);
      tagged.set(record.tag, group);
    }
  };

  return {
    of: (principal: string): Held | undefined => held.get(principal),
    // Re-set to move it to the young end of the eviction order.
    seen: (principal: string, entry: Held, at: number): void => {
      held.delete(principal);
      entry.lastSeen = at;
      held.set(principal, entry);
    },
    forget,
    remember,
    forgetAll: (): void => {
      held.clear();
      tagged.clear();
    },
    forgetTag: (tag: string): string[] => {
      // Copied before iterating: `forget` mutates the set this is walking.
      const principals = [...(tagged.get(tag) ?? [])];
      for (const principal of principals) forget(principal);
      return principals;
    },
    forgetIdle: (at: number, idleMs: number): void => {
      for (const [principal, entry] of [...held]) {
        if (at - entry.lastSeen >= idleMs) {
          forget(principal);
          evicted += 1;
        }
      }
    },
    list: (): IdentityReport[] => [...held].map(([principal, entry]) => ({ principal, since: entry.since, lastSeen: entry.lastSeen })),
    size: (): number => held.size,
    evicted: (): number => evicted,
  };
};

export const createIdentityCache = (ctx: IdentityCacheContext): IdentityCache => {
  const max = ctx.max ?? DEFAULT_IDENTITY_MAX;
  // A CEILING WITH NO ROOM UNDER IT CANNOT BE KEPT. Making room for a record
  // evicts until the cache is under its ceiling, and an empty cache is never
  // under zero: the first sign-in would spin there and take the process with
  // it. Refused where the cache is made, which is at boot, with the name of
  // the setting that carries the number.
  if (max <= 0) {
    throw new Error(`moss: \`runtime.identityMax\` is ${max}, and the identity cache needs room for at least one record. Give it 1 or more, or leave it unset for ${DEFAULT_IDENTITY_MAX}.`);
  }
  const idleMs = ctx.idleMs ?? DEFAULT_IDENTITY_IDLE_MS;
  const revalidateMs = ctx.revalidateMs ?? 0;
  const now = ctx.now ?? Date.now;

  const held = createHeldRecords(max);

  // IN FLIGHT, so that a burst of requests for one principal at login resolves
  // ONCE. Without this the first request's latency is paid by every request
  // that arrives while it is outstanding, which is precisely the moment a
  // browser opens six connections at once.
  //
  // Beside each resolve that is out: the tags forgotten while it was. Which tag
  // somebody wears is not known until their record lands.
  const pending = new Map<string, { work: Promise<IdentityRecord>; forgotten: Set<string> }>();

  let resolved = 0;
  let expired = 0;

  const get = async (principal: string): Promise<IdentityRecord> => {
    const at = now();
    const hit = held.of(principal);
    if (hit !== undefined) {
      const stale = revalidateMs > 0 && at - hit.since >= revalidateMs;
      if (!stale) {
        held.seen(principal, hit, at);
        return hit.record;
      }
      expired += 1;
    }

    const inFlight = pending.get(principal);
    if (inFlight !== undefined) return inFlight.work;

    // AN INVALIDATION WHILE THIS IS OUT WINS. It says that whatever is known of
    // the principal is stale, and this resolve read its rows before it was
    // said. Whoever is waiting is still answered: they asked before, too. But
    // the record is HELD only if this is still the resolve that is out for the
    // principal (an invalidation takes it off `pending`, and a later ask puts
    // its own there) and it wears no tag forgotten meanwhile. Holding it would
    // undo the invalidation for as long as the record lived.
    const forgotten = new Set<string>();
    const isStillOut = (): boolean => pending.get(principal)?.work === work;
    const work: Promise<IdentityRecord> = ctx
      .resolve(principal)
      .then((record) => {
        resolved += 1;
        const wearsForgottenTag = record.tag !== undefined && forgotten.has(record.tag);
        if (isStillOut() && !wearsForgottenTag) held.remember(principal, record, now());
        return record;
      })
      .finally(() => {
        // Only its own place: a resolve started after an invalidation is the one
        // a burst shares now, and this one landing must not take it out of flight.
        if (isStillOut()) pending.delete(principal);
      });
    pending.set(principal, { work, forgotten });
    return work;
  };

  // The idle sweep. Unref'd: a warm cache with no reader must not be the reason
  // a process refuses to exit.
  const sweep = idleMs > 0 ? setInterval(() => held.forgetIdle(now(), idleMs), Math.min(SWEEP_EVERY_MS, idleMs)) : undefined;
  sweep?.unref?.();

  return {
    get,
    invalidate: (principal) => {
      pending.delete(principal);
      return held.forget(principal);
    },
    invalidateAll: () => {
      held.forgetAll();
      pending.clear();
    },
    invalidateTag: (tag) => {
      const principals = held.forgetTag(tag);
      for (const principal of principals) pending.delete(principal);
      for (const flight of pending.values()) flight.forgotten.add(tag);
      return principals;
    },
    list: held.list,
    meter: () => ({ size: held.size(), max, resolved, evicted: held.evicted(), expired }),
    stop: () => {
      if (sweep !== undefined) clearInterval(sweep);
    },
  };
};
