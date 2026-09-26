import type { Row } from '../adapters/adapter.types.js';
import { hashText } from '../utils/canonical.js';

// ═══════════════════════════════════════════════════════════════
// LIVE ROWS — what makes a `refresh: 'reactive'` read reactive.
//
// Two structures, kept apart on purpose:
//
//   ROWS    — key → the rows a query returned. A cache: bounded by entries,
//             by bytes and by age, least-recently-used first out. Evicting
//             one never breaks anything; it costs one query.
//   FOLLOWS — key → what somebody is watching: the tables the query reads,
//             how to run it again, and who to tell. Small, and bounded by
//             what is mounted, not by this module: a follow ends when its
//             last follower's signal aborts.
//
// THE KEY IS THE COMPILED SQL AND ITS BOUND VALUES, which the engine hashes
// before it gets here. Scope compiles into both — row rules into the SQL,
// scope values into the parameters — so two callers share rows exactly when
// they would provably have got the same rows. Nothing here reasons about
// policy, and nothing needs to.
//
// A WRITE BUMPS ITS TABLES' VERSIONS. Rows remember the versions they were
// read at; a stored entry whose tables moved is stale, checked on read — so
// invalidation is a counter bump, not a walk over the cache. The same stamp
// closes the race that would otherwise poison it: rows fetched by a read
// that started BEFORE a write and finished after it carry the versions from
// before, so they are stale the moment they land.
//
// Followed keys are refetched once per burst (debounced, trailing), and a
// follower hears only when its own answer changed.
// ═══════════════════════════════════════════════════════════════

export type LiveRowsConfig = {
  /** How long stored rows are trusted, and how often a followed read is re-checked when nothing wrote. Default 60 000. */
  ttlMs?: number;
  /** Most stored results. Default 5 000. */
  maxEntries?: number;
  /** Most stored text, measured as the length of each result's JSON. Default 64 MiB. */
  maxBytes?: number;
  /** Largest single result worth storing; bigger ones are refetched every time. Default a tenth of `maxBytes`. */
  maxEntryBytes?: number;
  /** How long a burst of writes is gathered before followed reads refetch. Default 10. */
  debounceMs?: number;
};

export type LiveRowsStats = {
  entries: number;
  bytes: number;
  follows: number;
  followers: number;
  hits: number;
  misses: number;
  evictions: number;
  oversized: number;
  refreshes: number;
};

export type LiveRowsEvent =
  | { type: 'rows.evict'; reason: 'capacity' | 'oversized'; bytes: number }
  | { type: 'rows.error'; message: string };

// What running a query again needs, and which tables it reads.
export type RowsSource = {
  tables: readonly string[];
  fetch: () => Promise<Row[]>;
};

export type RowsFollower = {
  // New rows for the key. The follower decides whether its own answer changed.
  deliver: (rows: Row[]) => void;
};

export type LiveRows = {
  read: (key: string, source: RowsSource) => Promise<Row[]>;
  // Start following `key`. `rows` is what the follower was just answered
  // with. Ends when `signal` aborts.
  follow: (key: string, source: RowsSource, rows: Row[], follower: RowsFollower, signal: AbortSignal) => void;
  invalidate: (tables: readonly string[]) => void;
  stats: () => LiveRowsStats;
  // Stop every timer — for hosts that outlive the engine (tests, embedded tools).
  stop: () => void;
};

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 5_000;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_DEBOUNCE_MS = 10;
// A cache that evicts faster than it answers is too small for what it holds.
// Said at most once a minute, and only past a floor, so a cold start is quiet.
const THRASH_WINDOW_MS = 60_000;
const THRASH_FLOOR = 100;

type Stored = { rows: Row[]; bytes: number; tables: readonly string[]; seen: readonly number[]; at: number };
type Flight = { promise: Promise<Row[]>; tables: readonly string[]; seen: readonly number[] };
type Follow = {
  source: RowsSource;
  followers: Set<RowsFollower>;
  // The rows every follower was last brought up to, as a hash — when a refetch
  // returns the same, nobody's answer can have changed and nobody is mapped.
  rowsHash: string;
  // Refetches are numbered so a slow one landing after a newer one is dropped.
  issued: number;
  landed: number;
  timer?: ReturnType<typeof setTimeout>;
};

const unref = (timer: ReturnType<typeof setTimeout>): void => {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer && typeof timer.unref === 'function') timer.unref();
};

export const createLiveRows = (
  config: LiveRowsConfig = {},
  emit: (event: LiveRowsEvent) => void = () => {},
  now: () => number = Date.now,
): LiveRows => {
  const ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxEntryBytes = config.maxEntryBytes ?? Math.floor(maxBytes / 10);
  const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  const versions = new Map<string, number>();
  const versionOf = (table: string): number => versions.get(table) ?? 0;
  const snapshot = (tables: readonly string[]): number[] => tables.map(versionOf);
  const unchanged = (tables: readonly string[], seen: readonly number[]): boolean =>
    tables.every((table, i) => versionOf(table) === seen[i]);

  // Insertion order is recency: a hit is re-inserted, the oldest is first out.
  const stored = new Map<string, Stored>();
  let bytes = 0;
  const flights = new Map<string, Flight>();
  const follows = new Map<string, Follow>();
  const followsByTable = new Map<string, Set<string>>();

  const counts = { hits: 0, misses: 0, evictions: 0, oversized: 0, refreshes: 0 };
  const thrash = { start: now(), hits: 0, evictions: 0, warned: 0 };

  const drop = (key: string): void => {
    const entry = stored.get(key);
    if (entry === undefined) return;
    stored.delete(key);
    bytes -= entry.bytes;
  };

  const noteEviction = (): void => {
    const at = now();
    if (at - thrash.start > THRASH_WINDOW_MS) {
      thrash.start = at;
      thrash.hits = 0;
      thrash.evictions = 0;
    }
    thrash.evictions += 1;
    if (thrash.evictions >= THRASH_FLOOR && thrash.evictions > thrash.hits && at - thrash.warned > THRASH_WINDOW_MS) {
      thrash.warned = at;
      console.warn(
        `[vex:rows] evicting faster than answering (${thrash.evictions} evictions, ${thrash.hits} hits this minute) — raise the engine's rows.maxBytes / rows.maxEntries.`,
      );
    }
  };

  const store = (key: string, rows: Row[], tables: readonly string[], seen: readonly number[]): void => {
    drop(key);
    const size = (JSON.stringify(rows) ?? '').length;
    if (size > maxEntryBytes) {
      counts.oversized += 1;
      emit({ type: 'rows.evict', reason: 'oversized', bytes: size });
      return;
    }
    stored.set(key, { rows, bytes: size, tables, seen, at: now() });
    bytes += size;
    while (stored.size > maxEntries || bytes > maxBytes) {
      const oldest = stored.keys().next();
      if (oldest.done === true) break;
      const evicted = stored.get(oldest.value);
      drop(oldest.value);
      counts.evictions += 1;
      emit({ type: 'rows.evict', reason: 'capacity', bytes: evicted?.bytes ?? 0 });
      noteEviction();
    }
  };

  const read = (key: string, source: RowsSource): Promise<Row[]> => {
    const hit = stored.get(key);
    if (hit !== undefined) {
      if (now() - hit.at < ttlMs && unchanged(hit.tables, hit.seen)) {
        stored.delete(key);
        stored.set(key, hit);
        counts.hits += 1;
        thrash.hits += 1;
        return Promise.resolve(hit.rows);
      }
      drop(key);
    }
    counts.misses += 1;
    // Join a fetch already out — but only one that started after the last
    // write to these tables; an older one is about to return stale rows.
    const flight = flights.get(key);
    if (flight !== undefined && unchanged(flight.tables, flight.seen)) return flight.promise;

    const seen = snapshot(source.tables);
    const promise = source.fetch().then((rows) => {
      store(key, rows, source.tables, seen);
      return rows;
    });
    const entry: Flight = { promise, tables: source.tables, seen };
    flights.set(key, entry);
    const settle = (): void => {
      if (flights.get(key) === entry) flights.delete(key);
    };
    promise.then(settle, settle);
    return promise;
  };

  // ── follows ───────────────────────────────────────────────

  const dirty = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (key: string): void => {
    dirty.add(key);
    if (flushTimer !== undefined) return;
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      const keys = [...dirty];
      dirty.clear();
      for (const next of keys) void refresh(next, false);
    }, debounceMs);
    unref(flushTimer);
  };

  // Nothing wrote, but a lost invalidation (a write vex never saw, a signal
  // from another process that never came) must not leave a screen stale for
  // ever: every followed read is re-checked once per TTL, bypassing the cache.
  const arm = (key: string, follow: Follow): void => {
    if (follow.timer !== undefined) clearTimeout(follow.timer);
    if (!Number.isFinite(ttlMs)) return;
    follow.timer = setTimeout(() => void refresh(key, true), ttlMs);
    unref(follow.timer);
  };

  const refresh = async (key: string, bypass: boolean): Promise<void> => {
    const follow = follows.get(key);
    if (follow === undefined) return;
    follow.issued += 1;
    const ticket = follow.issued;
    if (bypass) drop(key);
    let rows: Row[];
    try {
      rows = await read(key, follow.source);
    } catch (err) {
      // The screen keeps its last good answer; the next write or TTL tries again.
      emit({ type: 'rows.error', message: err instanceof Error ? err.message : String(err) });
      if (follows.get(key) === follow) arm(key, follow);
      return;
    }
    if (follows.get(key) !== follow || ticket < follow.landed) return;
    follow.landed = ticket;
    counts.refreshes += 1;
    arm(key, follow);
    const rowsHash = hashText(JSON.stringify(rows) ?? '');
    if (rowsHash === follow.rowsHash) return;
    follow.rowsHash = rowsHash;
    for (const follower of [...follow.followers]) {
      try {
        follower.deliver(rows);
      } catch (err) {
        emit({ type: 'rows.error', message: err instanceof Error ? err.message : String(err) });
      }
    }
  };

  const unfollow = (key: string, follower: RowsFollower): void => {
    const follow = follows.get(key);
    if (follow === undefined) return;
    follow.followers.delete(follower);
    if (follow.followers.size > 0) return;
    follows.delete(key);
    dirty.delete(key);
    if (follow.timer !== undefined) clearTimeout(follow.timer);
    for (const table of follow.source.tables) {
      const keys = followsByTable.get(table);
      keys?.delete(key);
      if (keys !== undefined && keys.size === 0) followsByTable.delete(table);
    }
  };

  const follow = (key: string, source: RowsSource, rows: Row[], follower: RowsFollower, signal: AbortSignal): void => {
    if (signal.aborted) return;
    let existing = follows.get(key);
    if (existing === undefined) {
      existing = { source, followers: new Set(), rowsHash: hashText(JSON.stringify(rows) ?? ''), issued: 0, landed: 0 };
      follows.set(key, existing);
      for (const table of source.tables) {
        let keys = followsByTable.get(table);
        if (keys === undefined) {
          keys = new Set();
          followsByTable.set(table, keys);
        }
        keys.add(key);
      }
      arm(key, existing);
    }
    // A follower joining a follow that already exists keeps the follow's own
    // record of what everybody was last brought up to — if its rows are
    // newer, the refresh already scheduled will say so to everyone, and the
    // newcomer's own comparison drops the repeat.
    existing.followers.add(follower);
    signal.addEventListener('abort', () => unfollow(key, follower), { once: true });
  };

  const invalidate = (tables: readonly string[]): void => {
    for (const table of tables) versions.set(table, versionOf(table) + 1);
    for (const table of tables) {
      for (const key of followsByTable.get(table) ?? []) schedule(key);
    }
  };

  const stats = (): LiveRowsStats => {
    let followers = 0;
    for (const entry of follows.values()) followers += entry.followers.size;
    return { entries: stored.size, bytes, follows: follows.size, followers, ...counts };
  };

  const stop = (): void => {
    if (flushTimer !== undefined) clearTimeout(flushTimer);
    flushTimer = undefined;
    for (const entry of follows.values()) if (entry.timer !== undefined) clearTimeout(entry.timer);
  };

  return { read, follow, invalidate, stats, stop };
};
