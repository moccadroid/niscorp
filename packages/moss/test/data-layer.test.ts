import { describe, it, expect } from 'vitest';
import { createPglitePool } from '@niscorp/vex/pglite';
import { createMemoryCache } from '@niscorp/vex';
import { createDataLayer } from '../src/data/engine';
import { pristineDatabases } from './pristine-database';

const freshDatabase = pristineDatabases();

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
