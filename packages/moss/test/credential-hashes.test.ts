import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { initSessions, sessionOf } from '../src/sessions';
import { initIntegrations, integrationByKey } from '../src/integrations';

// GOLDEN: credentials already in somebody's database.
//
// A session token and an integration key are stored ONLY as a hash, and the
// hash is the lookup key. Change how either is hashed — a different digest, a
// salt, an encoding — and every row already written stops resolving: every
// person is signed out, every add-on's key stops working, and nothing errors.
// These rows are written the way an existing deployment holds them, with the
// hash PINNED as a literal, and must go on resolving through the real lookup.
//
// If one of these goes red, the hashing changed. Do not re-pin the literal:
// that is exactly the change that orphans the rows. Ship a migration that
// re-keys the stored credentials (or keeps verifying the old scheme), then add
// a row for the new scheme beside this one.

describe('golden — credentials stored by earlier versions still resolve', () => {
  it('a session row keyed by sha256(token), hex', async () => {
    const pool = createPglitePool(new PGlite());
    await initSessions(pool);
    await pool.query(
      `INSERT INTO sessions (token_hash, principal, expires_at) VALUES ($1, 'i_golden', now() + interval '1 hour')`,
      ['a2a1d51d2dea2a8e985d643dd415b41255117100f69ae9ad588d4e185ca1ad97'],
    );
    expect(await sessionOf(pool, 'st_golden-session-token')).toBe('i_golden');
  });

  it('an approved integration row keyed by sha256(key), hex', async () => {
    const pool = createPglitePool(new PGlite());
    await initIntegrations(pool);
    await pool.query(
      `INSERT INTO integrations (id, url, status, key_hash) VALUES ('golden', 'https://golden.example', 'approved', $1)`,
      ['0598e870dd2e385f715ec6140e5e8cfab09d468bc512533451d463eec3a50c25'],
    );
    expect(await integrationByKey(pool, 'ik_golden-integration-key')).toBe('golden');
  });
});
