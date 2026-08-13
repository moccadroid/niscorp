import { PGlite } from '@electric-sql/pglite';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import { DDL } from '@lyra/db/schema';
import { buildSeedSql } from '@lyra/db/seed';

export type DevRuntime = NiscRuntime & { db: PGlite };

export const devRuntime = async (): Promise<DevRuntime> => {
  const db = new PGlite();
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();

  const operatorKey = process.env['OPERATOR_KEY'] ?? '';

  // A FIXED SIGNING SEED, dev only. Lyra's database is in-memory and replayed on
  // every boot, so without this the assertion keypair is fresh each restart —
  // and the payments pack, a SEPARATE process holding lyra's old public key,
  // starts answering "who are you?" to every call until somebody re-copies the
  // new one. Set `LYRA_SIGNING_SEED` (32 bytes base64) and the public half stays
  // put across restarts, so the pack's env stays valid. Unset in production,
  // where the ephemeral key is the right default (assert.ts).
  const signingSeed = process.env['LYRA_SIGNING_SEED'] ?? '';

  return {
    db,
    pool: createPglitePool(db, RAW_DATE_PARSERS),
    cache,
    ...(operatorKey === '' ? {} : { operatorKey }),
    ...(signingSeed === '' ? {} : { signingSeed }),
  };
};
