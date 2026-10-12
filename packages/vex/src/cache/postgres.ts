import type { PgPool } from '../adapters/postgres/introspect.js';
import type { Query } from '../schemas/query.schema.js';
import type { CompiledIr } from '@niscorp/prism';
import type { MutationDefinition } from '../mutations/schema.js';
import type { CacheBackend, CacheEntry } from './cache.types.js';
import { isRefresh } from './cache.types.js';
import { validateEntry } from './validate.js';
import { fireAndForget } from './util.js';
import type { Sequence } from '@niscorp/strata';
import { migrate } from '@niscorp/strata/postgres';

export type { PgPool };

export type PostgresCacheConfig = {
  pool: PgPool;
  schema?: string;
  table?: string;
  onError?: (err: unknown) => void;
};

export type PostgresCache = CacheBackend & {
  init: () => Promise<void>;
  sequence: Sequence;
  entries: () => Promise<Array<{ key: string; entry: CacheEntry }>>;
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const quoteIdent = (name: string, label: string): string => {
  if (!IDENT.test(name)) {
    throw new Error(`Invalid ${label} identifier for postgres cache: "${name}"`);
  }
  return `"${name}"`;
};

const SELECT_COLS =
  'key, kind, intent, shape, dsl, prism_ir, reach, reason, created_at, expires_at, schema_fingerprint, protected, last_used_at, request_hash, refresh';

const rowToEntry = (row: Record<string, unknown>): CacheEntry => {
  const createdAt = (row['created_at'] as Date).getTime();
  const expiresAtRaw = row['expires_at'] as Date | null;
  const lastUsedRaw = row['last_used_at'] as Date | null;
  const fingerprint = row['schema_fingerprint'] as string | null;
  const meta = {
    createdAt,
    ...(expiresAtRaw ? { expiresAt: expiresAtRaw.getTime() } : {}),
    ...(lastUsedRaw ? { lastUsedAt: lastUsedRaw.getTime() } : {}),
    ...(row['protected'] === true ? { protected: true } : {}),
    ...(row['request_hash'] != null ? { requestHash: String(row['request_hash']) } : {}),
    ...(fingerprint ? { schemaFingerprint: fingerprint } : {}),
    ...(row['intent'] != null ? { intent: String(row['intent']) } : {}),
    ...(row['shape'] != null ? { shape: row['shape'] } : {}),
  };

  if (row['kind'] === 'unsatisfiable') {
    return { kind: 'unsatisfiable', reason: String(row['reason'] ?? ''), ...meta };
  }
  // A mutation's definition is stored in the `dsl` column.
  if (row['kind'] === 'mutation') {
    return {
      kind: 'mutation',
      mutation: row['dsl'] as MutationDefinition,
      ...(row['reach'] != null ? { reach: row['reach'] as string } : {}),
      ...meta,
    };
  }
  return {
    kind: 'ok',
    dsl: row['dsl'] as Query,
    ...(row['prism_ir'] != null ? { prismIr: row['prism_ir'] as CompiledIr } : {}),
    ...(row['reach'] != null ? { reach: row['reach'] as string } : {}),
    ...(isRefresh(row['refresh']) ? { refresh: row['refresh'] } : {}),
    ...meta,
  };
};

export const createPostgresCache = (config: PostgresCacheConfig): PostgresCache => {
  const { pool, onError } = config;
  const schema = quoteIdent(config.schema ?? 'public', 'schema');
  const table = quoteIdent(config.table ?? 'vex_cache', 'table');
  const qualified = `${schema}.${table}`;

  // The first migration converges a table of any earlier shape: its ADD COLUMN
  // IF NOT EXISTS steps catch up one created before those columns. A change is
  // appended as a new migration; this one is never edited.
  const isDefault = (config.schema ?? 'public') === 'public' && (config.table ?? 'vex_cache') === 'vex_cache';
  const slug = `${config.schema ?? 'public'}-${config.table ?? 'vex_cache'}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const sequence: Sequence = {
    id: isDefault ? 'nisc.vex.cache' : `nisc.vex.cache.${slug}`,
    migrations: [
      {
        description: 'The vex cache table, converged from any earlier shape',
        steps: [
          { kind: 'sql', sql: `CREATE SCHEMA IF NOT EXISTS ${schema}` },
          {
            kind: 'sql',
            sql: `CREATE TABLE IF NOT EXISTS ${qualified} (
        key                text PRIMARY KEY,
        kind               text NOT NULL DEFAULT 'ok',
        intent             text,
        shape              jsonb,
        dsl                jsonb,
        prism_ir           jsonb,
        reach              text,
        reason             text,
        created_at         timestamptz NOT NULL DEFAULT now(),
        expires_at         timestamptz,
        schema_fingerprint text,
        protected          boolean NOT NULL DEFAULT false,
        last_used_at       timestamptz,
        request_hash       text,
        refresh            text
      )`,
          },
          { kind: 'sql', sql: `ALTER TABLE ${qualified} ADD COLUMN IF NOT EXISTS protected boolean NOT NULL DEFAULT false` },
          { kind: 'sql', sql: `ALTER TABLE ${qualified} ADD COLUMN IF NOT EXISTS last_used_at timestamptz` },
          { kind: 'sql', sql: `ALTER TABLE ${qualified} ADD COLUMN IF NOT EXISTS request_hash text` },
          { kind: 'sql', sql: `ALTER TABLE ${qualified} ADD COLUMN IF NOT EXISTS reach text` },
          { kind: 'sql', sql: `ALTER TABLE ${qualified} ADD COLUMN IF NOT EXISTS refresh text` },
        ],
      },
    ],
  };

  const init = async (): Promise<void> => {
    await migrate(pool, [sequence]);
  };

  const evict = (key: string, reason: string): void => {
    fireAndForget(pool.query(`DELETE FROM ${qualified} WHERE key = $1`, [key]), onError);
    const err = new Error(`[vex:cache:postgres] evicted invalid row for key "${key}": ${reason}`);
    if (onError) onError(err);
    else console.error(err);
  };

  const get = async (key: string): Promise<CacheEntry | undefined> => {
    const res = await pool.query(
      `SELECT ${SELECT_COLS} FROM ${qualified}
       WHERE key = $1 AND (expires_at IS NULL OR expires_at > now())`,
      [key],
    );
    const row = res.rows[0];
    if (row === undefined) return undefined;

    const entry = rowToEntry(row);
    const error = validateEntry(entry);
    if (error !== null) {
      evict(key, error);
      return undefined;
    }
    return entry;
  };

  const set = async (key: string, entry: CacheEntry): Promise<void> => {
    const error = validateEntry(entry);
    if (error !== null) {
      const wrapped = new Error(
        `[vex:cache:postgres] refusing to write invalid entry for key "${key}": ${error}`,
      );
      if (onError) {
        onError(wrapped);
        return;
      }
      throw wrapped;
    }

    const isOk = entry.kind === 'ok';
    const dsl = isOk ? JSON.stringify(entry.dsl) : entry.kind === 'mutation' ? JSON.stringify(entry.mutation) : null;
    const prismIr = isOk && entry.prismIr !== undefined ? JSON.stringify(entry.prismIr) : null;
    const reason = entry.kind === 'unsatisfiable' ? entry.reason : null;
    const intent = entry.intent ?? null;
    const shape = entry.shape !== undefined ? JSON.stringify(entry.shape) : null;
    const createdAt = new Date(entry.createdAt);
    const expiresAt = entry.expiresAt !== undefined ? new Date(entry.expiresAt) : null;
    const fingerprint = entry.schemaFingerprint ?? null;
    const isProtected = entry.protected === true;
    const lastUsedAt = entry.lastUsedAt !== undefined ? new Date(entry.lastUsedAt) : null;
    const requestHash = entry.requestHash ?? null;
    const reach = entry.kind === 'unsatisfiable' ? null : (entry.reach ?? null);
    const refresh = entry.kind === 'ok' ? (entry.refresh ?? null) : null;

    await pool.query(
      `INSERT INTO ${qualified} (key, kind, intent, shape, dsl, prism_ir, reach, reason, created_at, expires_at, schema_fingerprint, protected, last_used_at, request_hash, refresh)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (key) DO UPDATE SET
         kind               = EXCLUDED.kind,
         intent             = EXCLUDED.intent,
         shape              = EXCLUDED.shape,
         dsl                = EXCLUDED.dsl,
         prism_ir           = EXCLUDED.prism_ir,
         reach              = EXCLUDED.reach,
         reason             = EXCLUDED.reason,
         created_at         = EXCLUDED.created_at,
         expires_at         = EXCLUDED.expires_at,
         schema_fingerprint = EXCLUDED.schema_fingerprint,
         protected          = EXCLUDED.protected,
         last_used_at       = EXCLUDED.last_used_at,
         request_hash       = EXCLUDED.request_hash,
         refresh            = EXCLUDED.refresh`,
      [key, entry.kind, intent, shape, dsl, prismIr, reach, reason, createdAt, expiresAt, fingerprint, isProtected, lastUsedAt, requestHash, refresh],
    );
  };

  const del = async (key: string): Promise<void> => {
    await pool.query(`DELETE FROM ${qualified} WHERE key = $1`, [key]);
  };

  const clear = async (): Promise<void> => {
    await pool.query(`DELETE FROM ${qualified}`);
  };

  const keys = async (): Promise<string[]> => {
    const res = await pool.query(
      `SELECT key FROM ${qualified} WHERE expires_at IS NULL OR expires_at > now()`,
    );
    return res.rows.map((r) => String(r['key']));
  };

  const entries = async (): Promise<Array<{ key: string; entry: CacheEntry }>> => {
    const res = await pool.query(
      `SELECT ${SELECT_COLS} FROM ${qualified}
       WHERE expires_at IS NULL OR expires_at > now()`,
    );
    const out: Array<{ key: string; entry: CacheEntry }> = [];
    for (const row of res.rows) {
      const key = String(row['key']);
      const entry = rowToEntry(row);
      const error = validateEntry(entry);
      if (error !== null) {
        evict(key, error);
        continue;
      }
      out.push({ key, entry });
    }
    return out;
  };

  return { init, sequence, get, set, delete: del, clear, keys, entries };
};
