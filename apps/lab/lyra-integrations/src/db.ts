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

// ── A DATABASE SOMEBODY ELSE BROUGHT ─────────────────────────
//
// The SQL in this service — the ledger, the event claim, the price and customer
// maps — ran nowhere. Every check deletes `DATABASE_URL` on purpose, so all of
// it exercised only the in-memory fallbacks, and a column renamed in a migration
// would have been found by a deployment rather than by a suite.
//
// Pointing a check at the Docker Postgres would trade that for a check that
// needs Docker, which is a check that gets skipped. So a caller may LEND one
// instead — `ledger-sql-check` boots PGlite in-process, runs the migrations into
// it, and hands it over here. Same statements, same constraints, no daemon.
//
// Deliberately not a fallback and not a default: a deployment reads its own
// `DATABASE_URL` and nothing else, and this is undefined the moment the check
// gives it back.
let lent: IntegrationDb | undefined;

export const lendDatabase = (db: IntegrationDb | undefined): void => {
  lent = db;
};

export const database = (): IntegrationDb | undefined => {
  if (lent !== undefined) return lent;
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
