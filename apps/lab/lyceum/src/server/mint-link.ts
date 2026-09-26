// `pnpm mint <principal>` — A ONE-TIME SIGN-IN LINK for the speaker or the stage.
//
// Run where the database is (in the container: `docker compose exec app pnpm
// mint speaker`). Prints a link that signs one device in as that principal,
// once, within 15 minutes. Only principals the `grants` table names can have
// one. Operator tooling, like the schema and the seed: it writes one row
// directly and is not part of the app. For testing — a mailed link replaces
// how the link travels, not how it is redeemed.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hashLinkToken } from './login';

const LINK_TTL_MS = 15 * 60 * 1000;

const main = async (): Promise<void> => {
  const principal = process.argv[2] ?? '';
  const databaseUrl = process.env['DATABASE_URL'] ?? '';
  const publicUrl = (process.env['PUBLIC_URL'] ?? 'http://localhost:8796').replace(/\/$/, '');
  if (principal === '') throw new Error('usage: pnpm mint <principal>   (speaker, stage)');
  if (databaseUrl === '') throw new Error('DATABASE_URL is not set — a link has to be minted into the database the server reads.');

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const held = await pool.query('SELECT 1 FROM grants WHERE principal = $1', [principal]);
    if (held.rows.length === 0) throw new Error(`no such principal: ${principal}`);
    const token = randomBytes(32).toString('base64url');
    await pool.query('INSERT INTO login_links (token_hash, principal, expires_at) VALUES ($1, $2, $3)', [
      hashLinkToken(token),
      principal,
      new Date(Date.now() + LINK_TTL_MS).toISOString(),
    ]);
    console.log(`${publicUrl}/login?token=${token}`);
    console.log(`(signs one device in as "${principal}", once, within 15 minutes)`);
  } finally {
    await pool.end();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
