import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { scopeBindings } from '../../src/scope/grants.js';
import type { ScopeBehaviors } from '../../src/scope/grants.js';
import { describeCaller } from '../../src/agent/index.js';
import { VexError } from '../../src/errors.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { GenerateDsl, GenerationCaller } from '../../src/types.js';

// WHO "ME" IS. A generation is told which columns the host's behaviors bind to
// a scope key the caller carries — read from what the host declared, never
// from a column's name — so "my name" can be written as a filter on the
// caller's own `$scope` value. Every reach and phase counts: a reader holds no
// insert, yet the insert's stamp is what says the column is theirs.

const BEHAVIORS: ScopeBehaviors = {
  // `id`, not `member_id` — the name tells nothing; the rule does.
  people: { default: { insert: [{ set: 'id', to: 'userId' }] }, personal: { update: [{ match: 'id', to: 'userId' }] } },
  notes: { write: [{ set: 'author', to: 'userId' }, { match: 'org', to: 'orgId' }] },
  teams: { read: [{ match: 'team_id', in: 'teamIds' }] },
};

describe('scopeBindings', () => {
  it('reads every reach and phase, and the name of the column is irrelevant', () => {
    expect(scopeBindings(BEHAVIORS, ['people'], { userId: 'u1' })).toEqual([{ entity: 'people', field: 'id', key: 'userId' }]);
  });

  it('keeps only keys the caller carries', () => {
    expect(scopeBindings(BEHAVIORS, ['notes'], { userId: 'u1' })).toEqual([{ entity: 'notes', field: 'author', key: 'userId' }]);
    expect(scopeBindings(BEHAVIORS, ['notes'], { userId: 'u1', orgId: 'o1' })).toEqual([
      { entity: 'notes', field: 'author', key: 'userId' },
      { entity: 'notes', field: 'org', key: 'orgId' },
    ]);
  });

  it('reads the set-valued form too', () => {
    expect(scopeBindings(BEHAVIORS, ['teams'], { teamIds: ['t1'] })).toEqual([{ entity: 'teams', field: 'team_id', key: 'teamIds' }]);
  });

  it('gives a caller with none of the keys — machinery — no self', () => {
    expect(scopeBindings(BEHAVIORS, ['people', 'notes', 'teams'], {})).toEqual([]);
  });

  it('only covers the tables it is asked about', () => {
    expect(scopeBindings(BEHAVIORS, ['teams'], { userId: 'u1' })).toEqual([]);
  });
});

describe('describeCaller', () => {
  it('names the columns and the keys, and says how to mean the caller', () => {
    const text = describeCaller([{ entity: 'people', field: 'id', key: 'userId' }]);
    expect(text).toContain('people.id');
    expect(text).toContain('{ "$scope": "userId" }');
  });

  it('says plainly when nothing identifies the caller', () => {
    expect(describeCaller([])).toContain('cannot be answered');
  });
});

describe('a generation is told who its caller is', () => {
  const db = new PGlite();
  const pool = createPglitePool(db);
  const adapter = createPostgresAdapter({ pool });
  // A reader: may read people, and do nothing else to them.
  const reader: ScopePolicy = { default: 'deny', entities: { people: { read: [] } } };
  const myName: Query = { from: ['people'], fields: ['people.name'], filter: { eq: ['people.id', { $scope: 'userId' }] } };

  beforeAll(async () => {
    await db.exec(`
      CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE notes (id TEXT PRIMARY KEY, author TEXT, org TEXT);
      CREATE TABLE teams (team_id TEXT PRIMARY KEY);
      INSERT INTO people VALUES ('u1', 'Ada'), ('u2', 'Ben');
    `);
  });
  afterAll(async () => {
    await db.close();
  });

  const spy = (): { seen: { caller?: GenerationCaller }; hook: GenerateDsl } => {
    const seen: { caller?: GenerationCaller } = {};
    return {
      seen,
      hook: async (_request, _schema, caller) => {
        seen.caller = caller;
        return myName;
      },
    };
  };

  it('from the behaviors, though its own policy keeps none of their rules', async () => {
    const { seen, hook } = spy();
    const engine = createQueryEngine({ adapter, scope: reader, generateDsl: hook, behaviors: BEHAVIORS });
    await engine.introspect();
    const answer = await engine.execute({ intent: 'what is my name', shape: [{ name: '' }], context: {} }, { scope: { userId: 'u2' } });
    expect(seen.caller?.bindings).toEqual([{ entity: 'people', field: 'id', key: 'userId' }]);
    // …and the query written with it answers for THIS caller.
    expect(answer.result).toEqual([{ name: 'Ben' }]);
  });

  it('never as a value', async () => {
    const { seen, hook } = spy();
    const engine = createQueryEngine({ adapter, scope: reader, generateDsl: hook, behaviors: BEHAVIORS });
    await engine.introspect();
    await engine.execute({ intent: 'my name, again', shape: [{ name: '' }], context: {} }, { scope: { userId: 'u1' } });
    expect(JSON.stringify(seen.caller?.bindings)).not.toContain('u1');
  });

  it('without behaviors, nothing identifies anybody', async () => {
    const { seen, hook } = spy();
    const engine = createQueryEngine({ adapter, scope: reader, generateDsl: hook });
    await engine.introspect();
    await engine.execute({ intent: 'what is my name, once more', shape: [{ name: '' }], context: {} }, { scope: { userId: 'u1' } });
    expect(seen.caller?.bindings).toEqual([]);
  });

  it('refuses at introspect behaviors naming a column the database does not have', async () => {
    const engine = createQueryEngine({ adapter, behaviors: { people: { insert: [{ set: 'person_id', to: 'userId' }] } } });
    await expect(engine.introspect()).rejects.toBeInstanceOf(VexError);
  });
});
