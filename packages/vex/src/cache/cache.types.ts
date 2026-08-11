import type { Query } from '../schemas/query.schema.js';
import type { CompiledIr } from '@niscorp/prism';
import type { MutationDefinition } from '../mutations/schema.js';

// ───────────────────────────────────────────────────────────────
// Cache entries
//
// Discriminated on `kind`:
//   - 'ok'            — a successful shape→DSL synthesis (+ optional
//                       Prism mapping IR). The happy path.
//   - 'mutation'      — a WRITE artifact: a dev-authored mutation def
//                       replayed by fingerprint. Never generated; enters
//                       only through the seed path (and is normally
//                       protected). Replay-only under any posture.
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
  /**
   * THE REACH THIS READ REQUIRES, whatever the caller's roles say.
   *
   * Reach is normally the caller's: a scope profile named by their role, applied
   * to every table they touch. That is right for a read whose answer legitimately
   * widens with the reader — a roster, a schedule, a members list.
   *
   * It is wrong for a read that means "mine". A principal may hold several roles
   * and the compiled policies merge to the WIDEST reach any of them grants, so an
   * instructor who also trains at the studio reads `bookings` studio-wide — and
   * "the classes you have booked" then answers with the whole studio's.
   *
   * An entry naming a reach is served at that profile instead, with the caller's
   * own grants unchanged. It can only narrow: a read the caller holds no verb for
   * is still refused. If the profile cannot be compiled, the read is refused
   * rather than served wide.
   */
  reach?: string;
};

export type UnsatisfiableCacheEntry = CacheEntryMeta & {
  kind: 'unsatisfiable';
  reason: string;
};

export type MutationCacheEntry = CacheEntryMeta & {
  kind: 'mutation';
  mutation: MutationDefinition;
  /**
   * THE REACH THIS WRITE REQUIRES — the same word reads use, and it belongs
   * here for a sharper reason.
   *
   * A read served too wide shows somebody too much. A write served too wide
   * CHANGES somebody else's row: `me/cancel` is "cancel MY booking", and its
   * whole safety is that the policy's update rules pin the row to the caller.
   * Take a principal who holds two roles and the merge widens those rules to
   * the broadest either grants — so the same fingerprint, replayed by somebody
   * who is a member AND something else, could reach a booking that is not
   * theirs.
   *
   * Declaring it here means the write is compiled at that profile whoever asks.
   */
  reach?: string;
};

export type CacheEntry = OkCacheEntry | UnsatisfiableCacheEntry | MutationCacheEntry;

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
