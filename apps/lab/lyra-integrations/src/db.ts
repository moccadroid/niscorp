import { Pool } from 'pg';

export type IntegrationDb = {
  query: <T = Record<string, unknown>>(text: string, values?: readonly unknown[]) => Promise<{ rows: T[] }>;
};

let pool: Pool | undefined;

// Lent by a check (an in-process PGlite with the migrations run), so the SQL
// runs without a daemon. A deployment reads `DATABASE_URL` and nothing else.
let lent: IntegrationDb | undefined;

export const lendDatabase = (db: IntegrationDb | undefined): void => {
  lent = db;
};

export const database = (): IntegrationDb | undefined => {
  if (lent !== undefined) return lent;
  const url = process.env['DATABASE_URL'] ?? '';
  if (url === '') return undefined;
  pool ??= new Pool({ connectionString: url, max: 8 });
  const held = pool;
  return { query: async (text, values) => held.query(text, values as unknown[]) as never };
};

export const closeDatabase = async (): Promise<void> => {
  await pool?.end();
  pool = undefined;
};
