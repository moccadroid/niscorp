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
  await pool.query('CREATE VIEW member_cards AS SELECT id, card, grammar FROM members');
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
  it('unset, the engine runs on its own defaults; given upgraded columns, it upgrades them and refuses one the database lacks; the app’s views are the one list', async () => {
    const layer = await layerWith();
    expect(layer.engine.compile(members).sql).toMatch(/LIMIT 100$/);
    expect(layer.engine.compile({ ...members, limit: 5000 }).sql).toMatch(/LIMIT 1000$/);

    const upgrading = await createDataLayer({ pool: layer.pool, cache: createMemoryCache(), upgradedColumns: { members: { card: { stamp: 'grammar', kind: 'app.members/card' } } }, upgrader });
    await upgrading.engine.cache.set('members/cards', { kind: 'ok', dsl: { from: ['members'], fields: ['members.card', 'members.grammar'] }, requestHash: 'written-here', createdAt: 0 });
    const { result } = await upgrading.engine.execute({ fingerprint: 'members/cards', context: {} });
    expect(result).toEqual([{ card: { upgraded: { n: 1 } }, grammar: { 'app.members': 1 } }]);
    await expect(createDataLayer({ pool: layer.pool, cache: createMemoryCache(), upgradedColumns: { members: { card: { stamp: 'stamped', kind: 'k' } } }, upgrader })).rejects.toThrow('members.stamped');

    expect(layer.grants.filter((grant) => grant.startsWith('member_cards.'))).toEqual([]);
    expect(layer.views).toEqual([]);
    const cards = { kind: 'ok' as const, dsl: { from: ['member_cards'], fields: ['member_cards.card', 'member_cards.grammar'] }, requestHash: 'written-here', createdAt: 0 };
    const viewing = await createDataLayer({ pool: layer.pool, cache: createMemoryCache(), views: ['member_cards'], vexConfig: { views: ['nowhere'] }, upgradedColumns: { members: { card: { stamp: 'grammar', kind: 'app.members/card' } } }, upgrader });
    expect(viewing.grants.filter((grant) => grant.startsWith('member_cards.'))).toEqual(['member_cards.read']);
    expect(viewing.views).toEqual([{ name: 'member_cards', reads: ['members'] }]);
    await viewing.engine.cache.set('members/site-cards', cards);
    expect((await viewing.engine.execute({ fingerprint: 'members/site-cards', context: {} })).result).toEqual([{ card: { n: 1 }, grammar: null }]);
    const upgradingView = await createDataLayer({ pool: layer.pool, cache: createMemoryCache(), views: ['member_cards'], upgradedColumns: { member_cards: { card: { stamp: 'grammar', kind: 'app.members/card' } } }, upgrader });
    await upgradingView.engine.cache.set('members/site-cards', cards);
    expect((await upgradingView.engine.execute({ fingerprint: 'members/site-cards', context: {} })).result).toEqual([{ card: { upgraded: { n: 1 } }, grammar: { 'app.members': 1 } }]);
  });

  it('set, its numbers are the engine\'s', async () => {
    const layer = await layerWith({ defaultLimit: 20, maxLimit: 5000 });
    expect(layer.engine.compile(members).sql).toMatch(/LIMIT 20$/);
    expect(layer.engine.compile({ ...members, limit: 5000 }).sql).toMatch(/LIMIT 5000$/);
  });
});
