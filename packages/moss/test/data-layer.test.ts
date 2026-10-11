import { describe, it, expect } from 'vitest';
import { createPglitePool } from '@niscorp/vex/pglite';
import { createMemoryCache } from '@niscorp/vex';
import { createDataLayer } from '../src/data/engine';
import { pristineDatabases } from './pristine-database';

// A database of its own for each test that wants one, started from one that
// was initialised once for this file (./pristine-database.ts says why).
const freshDatabase = pristineDatabases();

// The engine's settings reach the engine. Moss built it with none, so a
// deployment ran on vex's defaults — 100 rows for a query that states no
// limit, 1000 at most — and had no way to say otherwise.

const layerWith = async (vexConfig?: { defaultLimit?: number; maxLimit?: number }) => {
  const db = freshDatabase();
  const pool = createPglitePool(db);
  await pool.query('CREATE TABLE members (id text PRIMARY KEY, name text)');
  return createDataLayer({ pool, cache: createMemoryCache(), ...(vexConfig !== undefined ? { vexConfig } : {}) });
};

const members = { from: ['members'], fields: ['members.id'] };

describe('the data layer — runtime.vexConfig', () => {
  it('unset, the engine runs on its own defaults', async () => {
    const layer = await layerWith();
    expect(layer.engine.compile(members).sql).toMatch(/LIMIT 100$/);
    expect(layer.engine.compile({ ...members, limit: 5000 }).sql).toMatch(/LIMIT 1000$/);
  });

  it('set, its numbers are the engine\'s', async () => {
    const layer = await layerWith({ defaultLimit: 20, maxLimit: 5000 });
    expect(layer.engine.compile(members).sql).toMatch(/LIMIT 20$/);
    expect(layer.engine.compile({ ...members, limit: 5000 }).sql).toMatch(/LIMIT 5000$/);
  });
});
