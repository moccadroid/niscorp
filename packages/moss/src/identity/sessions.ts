import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import type { Sequence } from '@niscorp/strata';
import type { PgPool } from '@niscorp/vex';

const hashSessionToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const SESSION_TOKEN_PREFIX = 'st_';

const PrincipalRowSchema = z.object({ principal: z.string() });
const RemainingRowSchema = z.object({ remaining: z.coerce.number() });

// A migration that has run is never edited (its text is checksummed): append one instead.
export const SESSIONS_SEQUENCE: Sequence = {
  id: 'nisc.moss.sessions',
  migrations: [
    {
      description: 'The sessions table: a token is stored only as its hash',
      steps: [
        {
          kind: 'sql',
          sql: `CREATE TABLE IF NOT EXISTS sessions (
      token_hash text PRIMARY KEY,
      principal  text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    )`,
        },
      ],
    },
  ],
};

export const mintSession = async (pool: PgPool, principal: string, ttlMs: number): Promise<string> => {
  // Each mint sweeps the expired rows, so the table needs no timer.
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  const token = `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  await pool.query('INSERT INTO sessions (token_hash, principal, expires_at) VALUES ($1, $2, $3)', [hashSessionToken(token), principal, new Date(Date.now() + ttlMs)]);
  return token;
};

export const sessionOf = async (pool: PgPool, token: string): Promise<string | null> => {
  const res = await pool.query('SELECT principal FROM sessions WHERE token_hash = $1 AND expires_at > now()', [hashSessionToken(token)]);
  const row = PrincipalRowSchema.safeParse(res.rows[0]);
  return row.success ? row.data.principal : null;
};

export const sessionRemainingMs = async (pool: PgPool, token: string): Promise<number | null> => {
  const res = await pool.query('SELECT extract(epoch from expires_at - now()) * 1000 AS remaining FROM sessions WHERE token_hash = $1 AND expires_at > now()', [hashSessionToken(token)]);
  const row = RemainingRowSchema.safeParse(res.rows[0]);
  return row.success ? row.data.remaining : null;
};

export const revokeAllFor = async (pool: PgPool, principal: string): Promise<void> => {
  await pool.query('DELETE FROM sessions WHERE principal = $1', [principal]);
};
