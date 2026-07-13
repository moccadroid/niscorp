import type { Query } from '../schemas/query.schema.js';
import type { CompiledIr } from '@niscorp/prism';

// ───────────────────────────────────────────────────────────────
// Cache entries
//
// Discriminated on `kind`:
//   - 'ok'            — a successful shape→DSL synthesis (+ optional
//                       Prism mapping IR). The happy path.
//   - 'unsatisfiable' — a negative result: the agent decided this
//                       shape/intent cannot be satisfied. Cached so we
//                       don't re-run the agent on a known-impossible
//                       request. Always carries an `expiresAt` (a shape
//                       impossible today may be possible after a schema
//                       change).
// ───────────────────────────────────────────────────────────────

type CacheEntryMeta = {
  createdAt: number;
  /**
   * Touch-on-read timestamp. Lifetime is usage: a GC sweep evicts
   * entries unused for a configured window; protected entries never
   * sweep. Replaces the provisional/permanent distinction entirely.
   */
  lastUsedAt?: number;
  expiresAt?: number;
  /**
   * Protected entries refuse replacement: a fingerprint request whose
   * intent/shape differ from the stored ones errors instead of
   * regenerating. Written ONLY by the seed path and an explicit PATCH —
   * never by query execution.
   */
  protected?: boolean;
  /**
   * Identity of the request that produced this entry (intent + normalized
   * shape + context key names). A fingerprint request with a matching
   * hash is a hit; a differing one regenerates (or 409s when protected).
   */
  requestHash?: string;
  /**
   * Fingerprint of the database schema at write time. When it no longer
   * matches the current schema, the entry is stale (its DSL may
   * reference columns that have since changed) and is treated as a miss.
   */
  schemaFingerprint?: string;
  /**
   * The originating request's intent and shape — descriptive metadata
   * for inspection and the GET overview. Never part of identity.
   */
  intent?: string;
  shape?: unknown;
};

export type OkCacheEntry = CacheEntryMeta & {
  kind: 'ok';
  dsl: Query;
  prismIr?: CompiledIr;
};

export type UnsatisfiableCacheEntry = CacheEntryMeta & {
  kind: 'unsatisfiable';
  reason: string;
};

export type CacheEntry = OkCacheEntry | UnsatisfiableCacheEntry;

// ───────────────────────────────────────────────────────────────
// Backend interface
//
// `get/set/delete/clear/keys` are the core contract every backend
// implements. `init` and `entries` are optional capabilities: backends
// that need setup (Postgres) expose `init`, and backends that can
// enumerate without N+1 reads (Postgres, memory) expose `entries`. The
// tiered cache uses both for warm-up; a management UI would use
// `entries` for browsing.
// ───────────────────────────────────────────────────────────────

export type CacheBackend = {
  get: (key: string) => Promise<CacheEntry | undefined>;
  set: (key: string, entry: CacheEntry) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  keys: () => Promise<string[]>;
  init?: () => Promise<void>;
  entries?: () => Promise<Array<{ key: string; entry: CacheEntry }>>;
};
