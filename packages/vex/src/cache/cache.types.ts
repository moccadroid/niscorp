import type { Query } from '../schemas/query.schema.js';
import type { CompiledIr } from '@niscorp/prism';
import type { MutationDefinition } from '../mutations/schema.js';
import type { Sequence } from '@niscorp/strata';
import type { ScopeValues } from '../scope/scope.types.js';

export const REFRESH_MODES = ['snapshot', 'reactive'] as const;
export type Refresh = (typeof REFRESH_MODES)[number];

export const isRefresh = (value: unknown): value is Refresh => REFRESH_MODES.some((mode) => mode === value);

type CacheEntryMeta = {
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
  protected?: boolean;
  requestHash?: string;
  schemaFingerprint?: string;
  intent?: string;
  shape?: unknown;
};

export type OkCacheEntry = CacheEntryMeta & {
  kind: 'ok';
  dsl: Query;
  prismIr?: CompiledIr;
  // The prism config `prismIr` was compiled from, where vex wrote the mapping.
  mapping?: unknown;
  /**
   * The scope profile this read is served at, whatever the caller's roles say:
   * roles merge to the widest reach any of them grants, which is wrong for a
   * read that means "mine". A reach the host cannot compile refuses the read.
   */
  reach?: string;
  refresh?: Refresh;
};

export type UnsatisfiableCacheEntry = CacheEntryMeta & {
  kind: 'unsatisfiable';
  reason: string;
};

export type MutationCacheEntry = CacheEntryMeta & {
  kind: 'mutation';
  mutation: MutationDefinition;
  reach?: string;
};

export type CacheEntry = OkCacheEntry | UnsatisfiableCacheEntry | MutationCacheEntry;

export type CacheBackend = {
  // `scope`: whose request asks, for a cache that answers an entry to some callers and not to others.
  get: (key: string, scope?: ScopeValues) => Promise<CacheEntry | undefined>;
  set: (key: string, entry: CacheEntry) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  keys: () => Promise<string[]>;
  init?: () => Promise<void>;
  sequence?: Sequence;
  entries?: () => Promise<Array<{ key: string; entry: CacheEntry }>>;
};
