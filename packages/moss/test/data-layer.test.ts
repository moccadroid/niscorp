import { describe, it, expect } from 'vitest';
import { createPglitePool } from '@niscorp/vex/pglite';
import { createMemoryCache } from '@niscorp/vex';
import type { ColumnUpgrader } from '@niscorp/vex';
import { createDataLayer } from '../src/data/engine';
import { pristineDatabases } from './pristine-database';

const freshDatabase = pristineDatabases();

const layerWith = async (vexConfig?: { defaultLimit?: number; maxLimit?: number }) => {
  const db = freshDatabase();
  const pool = createPglitePool(db);
  await pool.query('CREATE TABLE members (id text PRIMARY KEY, name text, card jsonb, grammar jsonb)');
  await pool.query(`INSERT INTO members VALUES ('m1', 'Ada', '{"n": 1}', NULL)`);
  const layer = await createDataLayer({ pool, cache: createMemoryCache(), ...(vexConfig !== undefined ? { vexConfig } : {}) });
  return { ...layer, pool };
};

const members = { from: ['members'], fields: ['members.id'] };

const upgrader: ColumnUpgrader = {
  stamp: { 'app.members': 1 },
  locate: () => [],
  upgrade: (document) => ({ document: { upgraded: document }, stamp: { 'app.members': 1 }, applied: [] }),
};

describe('the data layer — runtime.vexConfig', () => {
  it('unset, the engine runs on its own defaults; given upgraded columns, it upgrades them and refuses one the database lacks', async () => {
    const layer = await layerWith();
    expect(layer.engine.compile(members).sql).toMatch(/LIMIT 100$/);
    expect(layer.engine.compile({ ...members, limit: 5000 }).sql).toMatch(/LIMIT 1000$/);

    const upgrading = await createDataLayer({ pool: layer.pool, cache: createMemoryCache(), upgradedColumns: { members: { card: { stamp: 'grammar', kind: 'app.members/card' } } }, upgrader });
    await upgrading.engine.cache.set('members/cards', { kind: 'ok', dsl: { from: ['members'], fields: ['members.card', 'members.grammar'] }, requestHash: 'written-here', createdAt: 0 });
    const { result } = await upgrading.engine.execute({ fingerprint: 'members/cards', context: {} });
    expect(result).toEqual([{ card: { upgraded: { n: 1 } }, grammar: { 'app.members': 1 } }]);
    await expect(createDataLayer({ pool: layer.pool, cache: createMemoryCache(), upgradedColumns: { members: { card: { stamp: 'stamped', kind: 'k' } } }, upgrader })).rejects.toThrow('members.stamped');
  });

  it('set, its numbers are the engine\'s', async () => {
    const layer = await layerWith({ defaultLimit: 20, maxLimit: 5000 });
    expect(layer.engine.compile(members).sql).toMatch(/LIMIT 20$/);
    expect(layer.engine.compile({ ...members, limit: 5000 }).sql).toMatch(/LIMIT 5000$/);
  });
});
