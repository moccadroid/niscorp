import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import type { Sequence } from '@niscorp/strata';
import { migrate } from '@niscorp/strata/postgres';
import type { PgPool } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// SESSIONS — the human credential, at the standard the machine one set.
//
// This server already answers "who is calling" three ways: an integration
// presents a 256-bit key stored hashed (../integrations, registry.ts), a deployment signs
// 30-second assertions with ed25519 (../integrations, credentials.ts) — and until this file, a
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
//
// THEY ARE WHAT `session: 'sessions'` VERIFIES WITH, AND NOTHING ELSE READS
// THEM. That deployment's database has the table (the server's one ledgered
// run makes it there, ../data, migrate.ts) and its verifier is the lookup
// below. A deployment whose `session` is a verifier of its own keeps its own
// credential: it has no table of these, no call here reads one for it, and a
// token minted here would be one nobody verifies. So the two calls an app
// makes (`mintSession`, `revokeAllFor`) say that in a sentence when the table
// is not there, where the driver said a relation does not exist.
// ═══════════════════════════════════════════════════════════════

const hashSessionToken = (token: string): string => createHash('sha256').update(token).digest('hex');

// What every token minted here starts with. It is how a stored session is
// told from a credential of a feature's own at the door (../server,
// authenticate.ts), which is why no feature may register a prefix that
// overlaps it.
export const SESSION_TOKEN_PREFIX = 'st_';

// What the two lookups read off a row. The database is outside this process,
// so a row is parsed like anything else that arrives: one that is not there,
// or does not hold what was selected, is nobody.
const PrincipalRowSchema = z.object({ principal: z.string() });
// `extract(epoch from …) * 1000` is numeric, which a driver hands over as a
// number or as the text of one.
const RemainingRowSchema = z.object({ remaining: z.coerce.number() });

// The sessions table, as a strata sequence. Its own sequence rather than part of
// `nisc.moss` because it exists only for a deployment that chose moss's own
// credential (`runtime.session: 'sessions'`). HISTORY: an applied migration is
// never edited — change the table by appending one (see test/baselines.test.ts).
export const SESSIONS_SEQUENCE: Sequence = {
  id: 'nisc.moss.sessions',
  migrations: [
    {
      description: 'The sessions table: a token is stored only as its hash',
      steps: [
        {
          kind: 'sql',
          // THE HASH, NEVER THE TOKEN (see the header, and ../integrations, credentials.ts for the rule).
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

// The table alone, through the ledger. A server makes it in the one pass that
// runs every owner's sequence (../data, migrate.ts), and the package exports
// no way to make it by itself: this is how the tests of this file stand one
// up.
export const initSessions = async (pool: PgPool): Promise<void> => {
  await migrate(pool, [SESSIONS_SEQUENCE]);
};

// What Postgres says of a table that is not there (`undefined_table`), as a
// driver hands it over: an error that carries the code.
const UNDEFINED_TABLE = '42P01';
const isUndefinedTable = (error: unknown): boolean => typeof error === 'object' && error !== null && 'code' in error && error.code === UNDEFINED_TABLE;

// ONE OF THE TWO CALLS AN APP MAKES ON THE STORED SESSIONS, run where the
// table may not be: in a deployment that did not choose them. What the
// database throws for any other reason is thrown as it is.
const onStoredSessions = async <Answer>(call: string, run: () => Promise<Answer>): Promise<Answer> => {
  try {
    return await run();
  } catch (error) {
    if (!isUndefinedTable(error)) throw error;
    throw new Error(
      `moss: ${call} was called on a database that has no \`sessions\` table. Moss's stored sessions are what \`session: 'sessions'\` verifies with: ` +
        'with that on the runtime, createServer and migrateTables make the table, and mintSession and revokeAllFor are for that deployment. ' +
        'An app whose `session` is a verifier of its own keeps its own credential, and mints and revokes it itself.',
      { cause: error },
    );
  }
};

// The broom rides the mint: every new session sweeps the expired ones, so
// the table is self-maintaining at exactly the rate it grows and no
// deployment needs a timer for it.
export const mintSession = (pool: PgPool, principal: string, ttlMs: number): Promise<string> =>
  onStoredSessions('mintSession', async () => {
    await pool.query('DELETE FROM sessions WHERE expires_at < now()');
    const token = `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    await pool.query('INSERT INTO sessions (token_hash, principal, expires_at) VALUES ($1, $2, $3)', [
      hashSessionToken(token),
      principal,
      new Date(Date.now() + ttlMs),
    ]);
    return token;
  });

export const sessionOf = async (pool: PgPool, token: string): Promise<string | null> => {
  const res = await pool.query('SELECT principal FROM sessions WHERE token_hash = $1 AND expires_at > now()', [hashSessionToken(token)]);
  const row = PrincipalRowSchema.safeParse(res.rows[0]);
  return row.success ? row.data.principal : null;
};

// How much longer a session resolves — how long a browser is told to keep the
// cookie that carries it.
export const sessionRemainingMs = async (pool: PgPool, token: string): Promise<number | null> => {
  const res = await pool.query('SELECT extract(epoch from expires_at - now()) * 1000 AS remaining FROM sessions WHERE token_hash = $1 AND expires_at > now()', [hashSessionToken(token)]);
  const row = RemainingRowSchema.safeParse(res.rows[0]);
  return row.success ? row.data.remaining : null;
};

export const revokeSession = async (pool: PgPool, token: string): Promise<void> => {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
};

export const revokeAllFor = (pool: PgPool, principal: string): Promise<void> =>
  onStoredSessions('revokeAllFor', async () => {
    await pool.query('DELETE FROM sessions WHERE principal = $1', [principal]);
  });
