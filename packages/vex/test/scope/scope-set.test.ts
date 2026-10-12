import { describe, it, expect } from 'vitest';
import { resolve } from '../../src/engine/resolver.js';
import { scopeResolved } from '../../src/scope/apply.js';
import { compileQuery } from '../../src/adapters/postgres/compile.js';
import { executeMutation } from '../../src/mutations/engine.js';
import type { MutationClient } from '../../src/mutations/engine.js';
import { MutationDefinitionSchema } from '../../src/mutations/schema.js';
import { resolveParams } from '../../src/utils/context.js';
import { VexScopeError } from '../../src/scope/apply.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';

const text = (name: string, nullable = false, primaryKey = false) => ({
  name,
  type: 'text',
  normalizedType: 'string' as const,
  nullable,
  primaryKey,
});

const schema: DatabaseSchema = {
  entities: [
    {
      name: 'bookings',
      table: 'bookings',
      fields: [text('id', false, true), text('studio_id'), text('person_id'), text('session_id', true), text('status')],
      relations: [{ type: 'belongsTo', entity: 'sessions', localFields: ['session_id'], foreignFields: ['id'] }],
      indexes: [],
    },
    {
      name: 'sessions',
      table: 'sessions',
      fields: [text('id', false, true), text('studio_id'), text('name')],
      relations: [{ type: 'hasMany', entity: 'bookings', localFields: ['id'], foreignFields: ['session_id'] }],
      indexes: [],
    },
  ],
};

const household: ScopePolicy = {
  default: 'deny',
  entities: {
    bookings: {
      read: [
        { match: 'studio_id', to: 'studioId' },
        { match: 'person_id', in: 'householdIds' },
      ],
    },
    sessions: { read: [{ match: 'studio_id', to: 'studioId' }] },
  },
};

const compiled = (dsl: Query, policy: ScopePolicy) => {
  const resolved = resolve(dsl, schema);
  scopeResolved(resolved, policy);
  return compileQuery(resolved);
};

describe('a set-valued read match', () => {
  it('compiles to = ANY() rather than =', () => {
    const { sql } = compiled({ from: ['bookings'], fields: ['bookings.id'] }, household);
    expect(sql).toMatch(/person_id = ANY\(\$\d+\)/);
    expect(sql).toMatch(/studio_id = \$\d+/);
  });

  it('binds the set through a scope slot, not a context one', () => {
    const { paramSlots } = compiled({ from: ['bookings'], fields: ['bookings.id'] }, household);
    const slot = paramSlots.find((s) => s.key === 'householdIds');
    expect(slot).toBeDefined();
    expect(slot?.kind).toBe('scope');
    expect(slot?.type).toBe('string[]');
  });

  // `col = ANY(NULL)` is NULL, not true, so the row drops; `col = ANY('{}')` is false.
  it('binds NULL when the scope value is absent, so nothing matches', async () => {
    const { paramSlots } = compiled({ from: ['bookings'], fields: ['bookings.id'] }, household);
    const params = await resolveParams(paramSlots, {}, { studioId: 'st_1' });
    expect(params[paramSlots.findIndex((s) => s.key === 'householdIds')]).toBeUndefined();
  });

  it('binds the empty set verbatim, so nothing matches', async () => {
    const { paramSlots } = compiled({ from: ['bookings'], fields: ['bookings.id'] }, household);
    const params = await resolveParams(paramSlots, {}, { studioId: 'st_1', householdIds: [] });
    expect(params[paramSlots.findIndex((s) => s.key === 'householdIds')]).toEqual([]);
  });

  it('lands in a LEFT join ON clause, not in WHERE', () => {
    const onSessions: ScopePolicy = {
      default: 'deny',
      entities: {
        bookings: { read: [{ match: 'studio_id', to: 'studioId' }] },
        sessions: { read: [{ match: 'id', in: 'visibleSessionIds' }] },
      },
    };
    const { sql } = compiled(
      { from: ['bookings', 'sessions'], fields: ['bookings.id', 'sessions.name'] },
      onSessions,
    );
    const [beforeWhere] = sql.split(' WHERE ');
    expect(beforeWhere).toMatch(/LEFT JOIN sessions/);
    expect(beforeWhere).toMatch(/= ANY\(\$\d+\)/);
  });
});

const writeSchema: DatabaseSchema = {
  entities: [
    {
      name: 'bookings',
      table: 'bookings',
      fields: [text('id', false, true), text('studio_id'), text('person_id'), text('status')],
      relations: [],
      indexes: [],
    },
  ],
};

const client = (): MutationClient & { seen: { sql: string; params: unknown[] }[] } => {
  const seen: { sql: string; params: unknown[] }[] = [];
  return {
    seen,
    query: async (sql: string, params: unknown[] = []) => {
      seen.push({ sql, params });
      return { rows: [{ id: 'b_1' }] };
    },
  };
};

const run = async (def: unknown, policy: ScopePolicy, scope: Record<string, unknown>) => {
  const db = client();
  const parsed = MutationDefinitionSchema.parse(def);
  await executeMutation(db, parsed, { context: {}, scope, policy, schema: writeSchema });
  return db;
};

describe('a set-valued match on a write', () => {
  const updatePolicy: ScopePolicy = {
    default: 'deny',
    entities: {
      bookings: {
        update: [
          { match: 'studio_id', to: 'studioId' },
          { match: 'person_id', in: 'householdIds' },
        ],
        delete: [{ match: 'person_id', in: 'householdIds' }],
      },
    },
  };

  it('narrows an UPDATE by = ANY()', async () => {
    const db = await run(
      { op: 'update', table: 'bookings', set: { status: 'cancelled' }, where: { eq: ['bookings.id', 'b_1'] } },
      updatePolicy,
      { studioId: 'st_1', householdIds: ['p_parent', 'p_child'] },
    );
    expect(db.seen[0]?.sql).toMatch(/person_id = ANY\(\$\d+\)/);
    expect(db.seen[0]?.params).toContainEqual(['p_parent', 'p_child']);
  });

  it('narrows a DELETE by = ANY()', async () => {
    const db = await run(
      { op: 'delete', table: 'bookings', where: { eq: ['bookings.id', 'b_1'] } },
      updatePolicy,
      { householdIds: ['p_parent', 'p_child'] },
    );
    expect(db.seen[0]?.sql).toMatch(/person_id = ANY\(\$\d+\)/);
  });

  it('REFUSES to pin an INSERT, because a write has one subject', async () => {
    const insertPolicy: ScopePolicy = {
      default: 'deny',
      entities: { bookings: { insert: [{ match: 'person_id', in: 'householdIds' }] } },
    };
    await expect(
      run(
        { op: 'insert', table: 'bookings', values: { status: 'booked' } },
        insertPolicy,
        { householdIds: ['p_parent', 'p_child'] },
      ),
    ).rejects.toThrow(VexScopeError);
  });

  it('...and says why, naming the rule', async () => {
    const insertPolicy: ScopePolicy = {
      default: 'deny',
      entities: { bookings: { insert: [{ match: 'person_id', in: 'householdIds' }] } },
    };
    await expect(
      run({ op: 'insert', table: 'bookings', values: { status: 'booked' } }, insertPolicy, {}),
    ).rejects.toThrow(/set-valued.*person_id.*householdIds.*single value/s);
  });

  it('leaves the scalar INSERT pin exactly as it was', async () => {
    const scalar: ScopePolicy = {
      default: 'deny',
      entities: { bookings: { insert: [{ set: 'person_id', to: 'userId' }, { match: 'studio_id', to: 'studioId' }] } },
    };
    const db = await run(
      { op: 'insert', table: 'bookings', values: { status: 'booked' } },
      scalar,
      { userId: 'p_ava', studioId: 'st_1' },
    );
    expect(db.seen[0]?.sql).toMatch(/INSERT INTO bookings/);
    expect(db.seen[0]?.params).toContain('p_ava');
    expect(db.seen[0]?.params).toContain('st_1');
  });
});
