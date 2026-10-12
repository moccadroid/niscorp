import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Sequence } from '@niscorp/strata';
import type { PgPool } from '@niscorp/vex';
import type { NiscRuntime, SessionVerifier } from '../runtime';

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

export const sessionVerifierOf = (runtime: Pick<NiscRuntime, 'session' | 'pool'>): SessionVerifier => {
  const chosen = runtime.session;
  // The type requires the field, so only a JS config reaches this.
  if (chosen === undefined) {
    throw new Error(
      'moss: `runtime.session` is unset — authentication is the one door that must not default open. ' +
        "Choose: 'sessions' (moss's stored credential: mintSession, revokeAllFor), 'dev-open' (every token is trusted; development only), or your own verifier function.",
    );
  }
  if (chosen === 'sessions') return (token) => sessionOf(runtime.pool, token);
  if (chosen === 'dev-open') {
    console.error('[moss] session: dev-open — every well-formed token is trusted, and a forged principal walks in. Development only.');
    return devSession;
  }
  console.info(`[moss] session: a function the app supplied${chosen.name === '' ? '' : ` (\`${chosen.name}\`)`} decides who a token is.`);
  return chosen;
};

export const sessionRevokerOf = (runtime: Pick<NiscRuntime, 'session' | 'pool'>): ((principal: string) => Promise<void>) | undefined =>
  runtime.session === 'sessions' ? (principal) => revokeAllFor(runtime.pool, principal) : undefined;

export const mintDevToken = (sub: string, claims: Record<string, unknown> = {}): string =>
  btoa(JSON.stringify({ sub, ...claims, iat: Date.now() }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const DevTokenSchema = z.object({ sub: z.string() });

export const devSession = (token: string): string | null => {
  try {
    const parsed = DevTokenSchema.safeParse(JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/'))));
    return parsed.success ? parsed.data.sub : null;
  } catch {
    return null;
  }
};
