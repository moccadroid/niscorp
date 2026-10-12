import type { Row } from '../adapters/adapter.types.js';
import { hashText } from '../utils/canonical.js';

// Stored rows are a cache: evicting one costs a query and breaks nothing. A
// follow is not one, and ends only when its last follower's signal aborts, so
// the two are kept apart. Rows carry the table versions from before their
// fetch began, so a read that straddles a write lands already stale.

export type LiveRowsConfig = {
  ttlMs?: number;
  maxEntries?: number;
  /** Measured as the length of each result's JSON. */
  maxBytes?: number;
  maxEntryBytes?: number;
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

export type RowsSource = {
  tables: readonly string[];
  fetch: () => Promise<Row[]>;
};

export type RowsFollower = {
  deliver: (rows: Row[]) => void;
};

export type LiveRows = {
  read: (key: string, source: RowsSource) => Promise<Row[]>;
  follow: (key: string, source: RowsSource, rows: Row[], follower: RowsFollower, signal: AbortSignal) => void;
  invalidate: (tables: readonly string[]) => void;
  stats: () => LiveRowsStats;
  stop: () => void;
};

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 5_000;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_DEBOUNCE_MS = 10;
const THRASH_WINDOW_MS = 60_000;
const THRASH_FLOOR = 100;

type Stored = { rows: Row[]; bytes: number; tables: readonly string[]; seen: readonly number[]; at: number };
type Flight = { promise: Promise<Row[]>; tables: readonly string[]; seen: readonly number[] };
type Follow = {
  source: RowsSource;
  followers: Set<RowsFollower>;
  rowsHash: string;
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
    // Join a fetch already out, but only one that started after the last write
    // to these tables: an older one is about to return stale rows.
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

  // A lost invalidation (a write vex never saw, a signal from another process
  // that never came) must not leave a follower stale for ever: each followed
  // read is re-checked once per TTL, bypassing the cache.
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
    // A follower joining an existing follow leaves `rowsHash` alone: were its
    // rows newer and the hash moved to them, the refresh already scheduled
    // would find no change and the earlier followers would never hear.
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
