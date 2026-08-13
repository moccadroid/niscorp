import { isRecord } from '@niscorp/nova/reflect';
import type { PgPool } from '@niscorp/vex';

export type Theme = { name: string; tokens: Record<string, string> };

const STOCK: Theme = { name: 'stock', tokens: {} };

let BY_STUDIO: Record<string, Theme> = {};

export const loadThemes = async (pool: PgPool): Promise<void> => {
  const result = await pool.query(/* sql */ `
    SELECT s.id AS studio_id, t.name, t.tokens
    FROM studios s
    JOIN themes t ON t.id = s.theme_id
  `);
  const byStudio: Record<string, Theme> = {};
  for (const row of result.rows) {
    const raw = row['tokens'];
    // A JSONB column comes back parsed; a text one would not. Accept both
    // rather than depend on which driver answered.
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const tokens: Record<string, string> = {};
    if (isRecord(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') tokens[key] = value;
      }
    }
    byStudio[String(row['studio_id'])] = { name: String(row['name'] ?? ''), tokens };
  }
  BY_STUDIO = byStudio;
};

export const themeFor = (studioId: string): Theme => BY_STUDIO[studioId] ?? STOCK;
