export type IdentityReport = {
  principal: string;
  since: number;
  lastSeen: number;
};

export type IdentityCache = {
  get: (principal: string) => Promise<IdentityRecord>;
  invalidate: (principal: string) => boolean;
  invalidateAll: () => void;
  invalidateTag: (tag: string) => readonly string[];
  list: () => IdentityReport[];
  meter: () => { size: number; max: number; resolved: number; evicted: number; expired: number };
  stop: () => void;
};

export type IdentityCacheContext = {
  resolve: (principal: string) => Promise<IdentityRecord>;
  max?: number;
  idleMs?: number;
  revalidateMs?: number;
  now?: () => number;
};

export const DEFAULT_IDENTITY_MAX = 10_000;

export const DEFAULT_IDENTITY_IDLE_MS = 30 * 60 * 1000;

const SWEEP_EVERY_MS = 60 * 1000;

type Held = {
  record: IdentityRecord;
  since: number;
  lastSeen: number;
};

const createHeldRecords = (max: number) => {
  // A Map keeps insertion order, and that is the eviction order: a read
  // deletes and re-sets its entry to make it the youngest.
  const held = new Map<string, Held>();

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
    // After the forget above, so re-resolving somebody already held evicts
    // nobody to make room it does not need.
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
    touch: (principal: string, entry: Held, at: number): void => {
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
  if (max <= 0) {
    throw new Error(`moss: \`runtime.identityMax\` is ${max}, and the identity cache needs room for at least one record. Give it 1 or more, or leave it unset for ${DEFAULT_IDENTITY_MAX}.`);
  }
  const idleMs = ctx.idleMs ?? DEFAULT_IDENTITY_IDLE_MS;
  const revalidateMs = ctx.revalidateMs ?? 0;
  const now = ctx.now ?? Date.now;

  const held = createHeldRecords(max);

  const pending = new Map<string, { work: Promise<IdentityRecord>; forgotten: Set<string> }>();

  let resolved = 0;
  let expired = 0;

  const get = async (principal: string): Promise<IdentityRecord> => {
    const at = now();
    const hit = held.of(principal);
    if (hit !== undefined) {
      const stale = revalidateMs > 0 && at - hit.since >= revalidateMs;
      if (!stale) {
        held.touch(principal, hit, at);
        return hit.record;
      }
      expired += 1;
    }

    const inFlight = pending.get(principal);
    if (inFlight !== undefined) return inFlight.work;

    // An invalidation while this resolve is out wins: the resolve read its
    // rows before it. Whoever waits is still answered, but the record is held
    // only if this is still the resolve in flight for the principal and it
    // wears no tag forgotten meanwhile (a tag is known only once it lands).
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
        if (isStillOut()) pending.delete(principal);
      });
    pending.set(principal, { work, forgotten });
    return work;
  };

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

export type IdentityRecord = {
  roles: readonly string[];
  scope: Record<string, unknown>;
  // Undefined means every registered integration is live; an empty list means none.
  installed?: readonly string[];
  tag?: string;
};

// NUL separates because no id can contain it. An undefined `installed` and an
// empty one are different answers, so they get different keys.
export const memoKey = (roles: readonly string[], installed: readonly string[] | undefined): string =>
  `${[...roles].sort().join('\0')}\0\0${installed === undefined ? '*' : [...installed].sort().join('\0')}`;
