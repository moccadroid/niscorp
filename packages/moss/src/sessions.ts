import { randomBytes, createHash } from 'node:crypto';
import type { PgPool } from '@niscorp/vex';
import { devSession } from './runtime';
import type { NiscRuntime, SessionVerifier } from './runtime';

// ═══════════════════════════════════════════════════════════════
// SESSIONS — the human credential, at the standard the machine one set.
//
// This server already answers "who is calling" three ways: an integration
// presents a 256-bit key stored hashed (integrations.ts), a deployment signs
// 30-second assertions with ed25519 (assert.ts) — and until this file, a
// person presented a JSON field anybody could author. Nothing about a person
// makes the weaker answer appropriate; this is the same credential the
// integration key is, one table over:
//
//   MINTED ONCE, SHOWN ONCE. 256 bits of CSPRNG behind an `st_` prefix; the
//   row keeps only the hash, so a stolen database does not hold a live
//   session. Presenting the token is the only way to produce the hash again.
//
//   EXPIRING. `expires_at` is written at mint and enforced on every read.
//   The socket already re-asks the verifier on a timer (sessionRevalidateMs)
//   precisely so an expiry can mean something on a held-open connection —
//   this is the verifier that gives that clock something to say.
//
//   REVOKED BY DELETING THE ROW. One token (sign out here) or every token a
//   principal holds (sign out everywhere, a role change, an offboarding).
//   No second mechanism to forget.
//
// The app mints at its own door (after ITS identity check — a password, an
// SSO callback, a magic link) and hands the token to the terminal. Moss
// never learns how the app decided; the app never touches token mechanics.
// ═══════════════════════════════════════════════════════════════

const hashSessionToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const initSessions = async (pool: PgPool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      -- THE HASH, NEVER THE TOKEN (see the header, and assert.ts for the rule).
      token_hash text PRIMARY KEY,
      principal  text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    )
  `);
};

// The broom rides the mint: every new session sweeps the expired ones, so
// the table is self-maintaining at exactly the rate it grows and no
// deployment needs a timer for it.
export const mintSession = async (pool: PgPool, principal: string, ttlMs: number): Promise<string> => {
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  const token = `st_${randomBytes(32).toString('base64url')}`;
  await pool.query('INSERT INTO sessions (token_hash, principal, expires_at) VALUES ($1, $2, $3)', [
    hashSessionToken(token),
    principal,
    new Date(Date.now() + ttlMs),
  ]);
  return token;
};

export const sessionOf = async (pool: PgPool, token: string): Promise<string | null> => {
  const res = await pool.query('SELECT principal FROM sessions WHERE token_hash = $1 AND expires_at > now()', [hashSessionToken(token)]);
  const principal = (res.rows[0] as { principal?: unknown } | undefined)?.principal;
  return typeof principal === 'string' ? principal : null;
};

export const revokeSession = async (pool: PgPool, token: string): Promise<void> => {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
};

export const revokeAllFor = async (pool: PgPool, principal: string): Promise<void> => {
  await pool.query('DELETE FROM sessions WHERE principal = $1', [principal]);
};

// The three-way choice, resolved once at boot (server.ts). Typed callers
// cannot reach the refusal — the field is required — but a JS config can,
// and the sentence names the choices rather than assuming the reader has
// the type open.
export const sessionVerifierOf = (runtime: Pick<NiscRuntime, 'session' | 'pool'>): SessionVerifier => {
  const chosen = runtime.session as NiscRuntime['session'] | undefined;
  if (chosen === undefined) {
    throw new Error(
      "moss: `runtime.session` is unset — authentication is the one door that must not default open. Choose: 'sessions' (moss's stored credential: mintSession/sessionOf/revokeSession), 'dev-open' (every token is trusted; development only), or your own verifier function.",
    );
  }
  if (chosen === 'sessions') return (token) => sessionOf(runtime.pool, token);
  if (chosen === 'dev-open') {
    console.error('[moss] session: dev-open — every well-formed token is trusted, and a forged principal walks in. Development only.');
    return devSession;
  }
  return chosen;
};
