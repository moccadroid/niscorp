import { describe, it, expect } from 'vitest';
import { migrate } from '@niscorp/strata/postgres';
import { createPglitePool } from '@niscorp/vex/pglite';
import { SESSIONS_SEQUENCE, sessionOf } from '../src/identity/sessions';
import { integrationByKey } from '../src/integrations/registry';
import { registryOver } from './registry-db';
import { pristineDatabases } from './pristine-database';

const freshDatabase = pristineDatabases();

// The hashes are pinned as literals. When one goes red the hashing changed, and every credential already stored
// would stop resolving: do not re-pin, ship a migration that re-keys the stored credentials.

describe('golden — credentials stored by earlier versions still resolve', () => {
  it('a session row keyed by sha256(token), hex', async () => {
    const pool = createPglitePool(freshDatabase());
    await migrate(pool, [SESSIONS_SEQUENCE]);
    await pool.query(
      `INSERT INTO sessions (token_hash, principal, expires_at) VALUES ($1, 'i_golden', now() + interval '1 hour')`,
      ['a2a1d51d2dea2a8e985d643dd415b41255117100f69ae9ad588d4e185ca1ad97'],
    );
    expect(await sessionOf(pool, 'st_golden-session-token')).toBe('i_golden');
  });

  it('an approved integration row keyed by sha256(key), hex', async () => {
    const pool = createPglitePool(freshDatabase());
    const registry = await registryOver(pool);
    await pool.query(
      `INSERT INTO integrations (id, url, status, key_hash) VALUES ('golden', 'https://golden.example', 'approved', $1)`,
      ['0598e870dd2e385f715ec6140e5e8cfab09d468bc512533451d463eec3a50c25'],
    );
    expect(await integrationByKey(registry, 'ik_golden-integration-key')).toBe('golden');
  });
});
