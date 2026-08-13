import { isRecord } from '@niscorp/nova/reflect';
import type { PgPool } from '@niscorp/vex';

export type Theme = { name: string; tokens: Record<string, string> };

const STOCK: Theme = { name: 'stock', tokens: {} };

// ONE STUDIO'S THEME, read when it is wanted.
//
// This was `BY_STUDIO`, filled at boot from a join over every studio — a
// resident copy of a table, held so a synchronous seam could be answered. The
// seam is asynchronous now (`shell.inputs`), so the obvious implementation is
// available: read the row.
//
// Once per shell build, not once per request. A theme is a property of a
// tenant, and a shell is already the thing that is rebuilt when a tenant's
// theme changes.
export const themeFor = async (pool: PgPool, studioId: string): Promise<Theme> => {
  if (studioId === '') return STOCK;
  const result = await pool.query(
    /* sql */ `SELECT t.name, t.tokens FROM studios s JOIN themes t ON t.id = s.theme_id WHERE s.id = $1`,
    [studioId],
  );
  const row = result.rows[0];
  if (row === undefined) return STOCK;
  // A JSONB column comes back parsed; a text one would not. Accept both rather
  // than depend on which driver answered.
  const raw = row['tokens'];
  const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const tokens: Record<string, string> = {};
  if (isRecord(parsed)) {
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') tokens[key] = value;
    }
  }
  return { name: String(row['name'] ?? ''), tokens };
};
