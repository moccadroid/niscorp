import { Pool } from 'pg';

// ── THIS SERVICE'S OWN DATABASE ──────────────────────────────
//
// One Postgres for every integration, one table prefix per integration.
// Integrations already share a process; a connection string each would be
// ceremony around a boundary the prefix states plainly, and `integration-check`
// is what enforces it rather than everybody remembering.
//
// ABSENT IS A REAL STATE, not an error. With no `DATABASE_URL` the integrations fall
// back to memory, which is what the checks run against — 30-odd checks booting
// a shared Postgres would be order-dependent and flaky, and the in-process
// isolation they have now is the thing that has caught the most bugs. It is
// also what a developer gets before they run `pnpm db:up`, and that should be a
// working service rather than a crash.
//
// It is NOT what a deployment should get, which is why the integration says so out
// loud at boot rather than discovering it when an account goes missing.

export type IntegrationDb = {
  query: <T = Record<string, unknown>>(text: string, values?: readonly unknown[]) => Promise<{ rows: T[] }>;
};

let pool: Pool | undefined;

export const database = (): IntegrationDb | undefined => {
  const url = process.env['DATABASE_URL'] ?? '';
  if (url === '') return undefined;
  // Lazily, and once: `serve.ts` mounts integrations at import time, and a pool built
  // then would open sockets in every check that merely imports this file.
  pool ??= new Pool({ connectionString: url, max: 8 });
  const held = pool;
  return { query: async (text, values) => held.query(text, values as unknown[]) as never };
};

export const closeDatabase = async (): Promise<void> => {
  await pool?.end();
  pool = undefined;
};
