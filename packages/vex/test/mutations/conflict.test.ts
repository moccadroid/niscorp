import { describe, it, expect } from 'vitest';
import { executeMutation } from '../../src/mutations/engine.js';
import type { MutationClient } from '../../src/mutations/engine.js';
import { MutationDefinitionSchema } from '../../src/mutations/schema.js';
import type { MutationDefinition } from '../../src/mutations/schema.js';
import { collectMutationContext, mutationEffect, requiredContextKeys } from '../../src/mutations/signature.js';
import { VexError } from '../../src/errors.js';
import { VexScopeError } from '../../src/scope/apply.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

// ═══════════════════════════════════════════════════════════════
// onConflict, $lookup, insertEach — the write grammar's three ways
// past "one caller-shaped statement per row":
//   onConflict  — the DATABASE arbitrates insert-vs-update, atomically
//   $lookup     — a value read from another table, read-scoped
//   insertEach  — one statement for a caller-sized list
// ═══════════════════════════════════════════════════════════════

// ─── Fixtures — the shape of the real use case (people/enrolment) ─

const field = (name: string, normalizedType = 'string', primaryKey = false) => ({
  name,
  type: normalizedType,
  normalizedType: normalizedType as 'string',
  nullable: !primaryKey,
  primaryKey,
});

const schema: DatabaseSchema = {
  entities: [
    {
      name: 'people',
      table: 'people',
      fields: [field('id', 'string', true), field('email'), field('name'), field('phone')],
      relations: [],
      indexes: [{ name: 'people_email_key', fields: ['email'], unique: true, type: 'btree' }],
    },
    {
      name: 'memberships',
      table: 'memberships',
      fields: [field('id', 'string', true), field('studio_id'), field('person_id'), field('notes')],
      relations: [],
      indexes: [{ name: 'memberships_studio_person_key', fields: ['studio_id', 'person_id'], unique: true, type: 'btree' }],
    },
    {
      name: 'slots',
      table: 'slots',
      fields: [field('id', 'string', true), field('studio_id'), field('name'), field('weekday', 'number'), field('starts_at')],
      relations: [],
      indexes: [],
    },
    {
      name: 'salaries',
      table: 'salaries',
      fields: [field('id', 'string', true), field('person_id'), field('amount', 'number')],
      relations: [],
      indexes: [],
    },
  ],
};

// Tenant boundary on memberships/slots; people globally writable; salaries
// unreadable — the table a $lookup must never smuggle a value out of.
const policy: ScopePolicy = {
  default: 'deny',
  entities: {
    people: { read: [], write: [] },
    memberships: {
      read: [{ match: 'studio_id', to: 'studioId' }],
      write: [
        { set: 'studio_id', to: 'studioId' },
        { match: 'studio_id', to: 'studioId' },
      ],
    },
    slots: {
      write: [
        { set: 'studio_id', to: 'studioId' },
        { match: 'studio_id', to: 'studioId' },
      ],
    },
    salaries: { deny: true },
  },
};

type Call = { sql: string; params: unknown[] };
const fakeClient = (opts?: { rows?: unknown[] }) => {
  const calls: Call[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return { rows: opts?.rows ?? [{ id: 'row_1' }] };
  };
  const client: MutationClient = {
    query,
    transaction: async <T,>(fn: (tx: { query: typeof query }) => Promise<T>): Promise<T> => fn({ query }),
  };
  return { client, calls };
};

const scope = { studioId: 'studio_1' };

// ─── ON CONFLICT ────────────────────────────────────────────────

describe('onConflict grammar', () => {
  it('parses DO UPDATE and DO NOTHING forms', () => {
    expect(() =>
      MutationDefinitionSchema.parse({
        op: 'insert',
        table: 'people',
        values: { email: { $context: 'email' } },
        onConflict: { target: ['email'], set: { email: { $context: 'email' } } },
      }),
    ).not.toThrow();
    expect(() =>
      MutationDefinitionSchema.parse({ op: 'insert', table: 'people', values: { email: 'x' }, onConflict: { target: ['email'] } }),
    ).not.toThrow();
  });

  it('rejects an empty target', () => {
    expect(() =>
      MutationDefinitionSchema.parse({ op: 'insert', table: 'people', values: { email: 'x' }, onConflict: { target: [] } }),
    ).toThrow();
  });
});

describe('onConflict compile', () => {
  it('DO NOTHING when no set is declared', async () => {
    const { client, calls } = fakeClient();
    await executeMutation(
      client,
      { op: 'insert', table: 'people', values: { id: { $context: 'id' }, email: { $context: 'email' } }, onConflict: { target: ['email'] } },
      { context: { id: 'p1', email: 'a@b.c' }, scope, policy, schema },
    );
    expect(calls[0]!.sql).toContain('ON CONFLICT (email) DO NOTHING');
    expect(calls[0]!.sql).toContain('RETURNING *');
  });

  it('DO UPDATE SET — the create-or-fetch touch keeps RETURNING alive on both paths', async () => {
    const { client, calls } = fakeClient();
    await executeMutation(
      client,
      {
        op: 'insert',
        table: 'people',
        values: { id: { $context: 'id' }, email: { $context: 'email' }, name: { $context: 'name' } },
        onConflict: { target: ['email'], set: { email: { $context: 'email' } } },
      },
      { context: { id: 'p1', email: 'a@b.c', name: 'Ada' }, scope, policy, schema },
    );
    expect(calls[0]!.sql).toMatch(/ON CONFLICT \(email\) DO UPDATE SET email = \$\d+/);
    expect(calls[0]!.sql).toContain('RETURNING *');
  });
});

describe('onConflict validation', () => {
  it('refuses a target that matches no unique constraint, and teaches the real options', async () => {
    const { client, calls } = fakeClient();
    let caught: VexError | undefined;
    try {
      await executeMutation(
        client,
        { op: 'insert', table: 'people', values: { email: 'x' }, onConflict: { target: ['name'] } },
        { context: {}, scope, policy, schema },
      );
    } catch (e) {
      caught = e as VexError;
    }
    expect(caught?.code).toBe('invalid_dsl');
    expect(caught?.message).toContain('(name)');
    expect(caught?.message).toContain('(email)'); // the actual unique set is in the message
    expect(calls).toHaveLength(0);
  });

  it('accepts a multi-column target in any order', async () => {
    const { client } = fakeClient();
    await expect(
      executeMutation(
        client,
        {
          op: 'insert',
          table: 'memberships',
          values: { id: { $context: 'id' }, person_id: { $context: 'personId' } },
          onConflict: { target: ['person_id', 'studio_id'] },
        },
        { context: { id: 'm1', personId: 'p1' }, scope, policy, schema },
      ),
    ).resolves.toBeDefined();
  });

  it('skips the check when the schema carries no uniqueness info', async () => {
    const bare: DatabaseSchema = {
      entities: [{ name: 'slots', table: 'slots', fields: [field('id'), field('name')], relations: [], indexes: [] }],
    };
    const { client } = fakeClient();
    await expect(
      executeMutation(
        client,
        { op: 'insert', table: 'slots', values: { name: 'x' }, onConflict: { target: ['name'] } },
        { context: {}, scope, policy: { default: 'allow', entities: {} }, schema: bare },
      ),
    ).resolves.toBeDefined();
  });

  it('rejects unknown columns in target and set', async () => {
    const { client } = fakeClient();
    await expect(
      executeMutation(
        client,
        { op: 'insert', table: 'people', values: { email: 'x' }, onConflict: { target: ['emial'] } },
        { context: {}, scope, policy, schema },
      ),
    ).rejects.toThrow(/emial/);
  });
});

describe('onConflict scope', () => {
  it('DO UPDATE requires an update grant — insert-only refuses', async () => {
    const insertOnly: ScopePolicy = {
      default: 'deny',
      entities: { people: { insert: [] } },
    };
    const { client, calls } = fakeClient();
    await expect(
      executeMutation(
        client,
        { op: 'insert', table: 'people', values: { email: 'x' }, onConflict: { target: ['email'], set: { name: 'y' } } },
        { context: {}, scope, policy: insertOnly, schema },
      ),
    ).rejects.toThrow(VexScopeError);
    expect(calls).toHaveLength(0);
  });

  it('DO NOTHING needs no update grant', async () => {
    const insertOnly: ScopePolicy = { default: 'deny', entities: { people: { insert: [] } } };
    const { client } = fakeClient();
    await expect(
      executeMutation(
        client,
        { op: 'insert', table: 'people', values: { email: 'x' }, onConflict: { target: ['email'] } },
        { context: {}, scope, policy: insertOnly, schema },
      ),
    ).resolves.toBeDefined();
  });

  it('a match rule NOT in the target becomes a WHERE on the DO UPDATE half', async () => {
    // memberships' boundary column is studio_id; conflict on the PK does not
    // pin it, so the RLS boundary must land as ON CONFLICT ... WHERE.
    const { client, calls } = fakeClient();
    await executeMutation(
      client,
      {
        op: 'insert',
        table: 'memberships',
        values: { id: { $context: 'id' }, person_id: { $context: 'personId' } },
        onConflict: { target: ['id'], set: { notes: { $context: 'notes' } } },
      },
      { context: { id: 'm1', personId: 'p1', notes: 'hi' }, scope, policy, schema },
    );
    expect(calls[0]!.sql).toMatch(/DO UPDATE SET .*WHERE memberships\.studio_id = \$\d+/);
  });

  it('a match rule already IN the target adds no WHERE — the pinned insert value arbitrates', async () => {
    const { client, calls } = fakeClient();
    await executeMutation(
      client,
      {
        op: 'insert',
        table: 'memberships',
        values: { id: { $context: 'id' }, person_id: { $context: 'personId' } },
        onConflict: { target: ['studio_id', 'person_id'], set: { notes: { $context: 'notes' } } },
      },
      { context: { id: 'm1', personId: 'p1', notes: 'hi' }, scope, policy, schema },
    );
    expect(calls[0]!.sql).toContain('DO UPDATE SET');
    expect(calls[0]!.sql).not.toContain('DO UPDATE SET notes = $4 WHERE');
  });
});

describe('onConflict signatures', () => {
  const def = {
    op: 'insert' as const,
    table: 'people',
    values: { email: { $context: 'email' } },
    onConflict: { target: ['email'], set: { name: { $context: 'name' } } },
  };

  it('declares the DO UPDATE as the update it is', () => {
    const effects = mutationEffect(def);
    expect(effects).toHaveLength(2);
    expect(effects[1]).toEqual({ op: 'update', table: 'people', columns: ['name'] });
  });

  it('collects and requires the conflict-set context keys', () => {
    expect(Object.keys(collectMutationContext(def, schema)).sort()).toEqual(['email', 'name']);
    expect(requiredContextKeys(def)).toEqual(['email', 'name']);
  });
});

// ─── $lookup ────────────────────────────────────────────────────

describe('$lookup', () => {
  // Annotated, so the literal is CHECKED against the grammar rather than
  // inferred into a looser shape of its own — unannotated, the `eq` pair widens
  // to an array and the fixture stops being a mutation the engine would accept.
  const enroll: MutationDefinition = {
    op: 'insert' as const,
    table: 'memberships',
    values: {
      id: { $context: 'id' },
      person_id: { $lookup: { from: 'people', field: 'id', where: { eq: ['people.email', { $context: 'email' }] } } },
    },
  };

  it('compiles to an inline scalar subquery with shared param numbering', async () => {
    const { client, calls } = fakeClient();
    await executeMutation(client, enroll, { context: { id: 'm1', email: 'a@b.c' }, scope, policy, schema });
    expect(calls[0]!.sql).toMatch(/\(SELECT id FROM people WHERE people\.email = \$\d+\)/);
    // params bind in slot order: id, email, then the scope-pinned studio_id
    expect(calls[0]!.params).toEqual(['m1', 'a@b.c', 'studio_1']);
  });

  it('applies the LOOKED-UP table read rules — a write entry is not a read-scope bypass', async () => {
    const boundedPeople: ScopePolicy = {
      ...policy,
      entities: { ...policy.entities, people: { read: [{ match: 'id', to: 'userId' }] } },
    };
    const { client, calls } = fakeClient();
    await executeMutation(client, enroll, {
      context: { id: 'm1', email: 'a@b.c' },
      scope: { ...scope, userId: 'u1' },
      policy: boundedPeople,
      schema,
    });
    expect(calls[0]!.sql).toMatch(/SELECT id FROM people WHERE \(people\.email = \$\d+ AND people\.id = \$\d+\)/);
    expect(calls[0]!.params).toContain('u1');
  });

  it('refuses a lookup into a denied table before any SQL runs', async () => {
    const { client, calls } = fakeClient();
    await expect(
      executeMutation(
        client,
        {
          op: 'insert',
          table: 'memberships',
          values: { id: 'm1', notes: { $lookup: { from: 'salaries', field: 'amount', where: { eq: ['salaries.person_id', { $context: 'pid' }] } } } },
        },
        { context: { pid: 'p1' }, scope, policy, schema },
      ),
    ).rejects.toThrow(VexScopeError);
    expect(calls).toHaveLength(0);
  });

  it('refuses a lookup into an unknown table or column', async () => {
    const { client } = fakeClient();
    await expect(
      executeMutation(
        client,
        { op: 'insert', table: 'people', values: { name: { $lookup: { from: 'nowhere', field: 'x', where: { eq: ['nowhere.x', 'y'] } } } } },
        { context: {}, scope, policy, schema },
      ),
    ).rejects.toThrow(/nowhere/);
  });

  it('its WHERE binds context like any filter — collected, typed, and required', () => {
    const sig = collectMutationContext(enroll, schema);
    expect(sig['email']).toBeDefined();
    expect(sig['email']!.column).toBe('people.email');
    expect(requiredContextKeys(enroll)).toEqual(['email', 'id']);
  });
});

// ─── insertEach ─────────────────────────────────────────────────

describe('insertEach', () => {
  const slots = {
    op: 'insertEach' as const,
    table: 'slots',
    items: { $context: 'days' },
    values: {
      name: { $context: 'name' },
      weekday: { $item: 'weekday' },
      starts_at: { $item: 'startsAt' },
    },
  };

  it('compiles to INSERT ... SELECT over jsonb_array_elements, casting per column type', async () => {
    const { client, calls } = fakeClient();
    await executeMutation(client, slots, {
      context: { name: 'Yoga', days: [{ weekday: 1, startsAt: '18:00' }, { weekday: 3, startsAt: '19:00' }] },
      scope,
      policy,
      schema,
    });
    const sql = calls[0]!.sql;
    expect(sql).toMatch(/INSERT INTO slots \(name, weekday, starts_at, studio_id\) SELECT/);
    expect(sql).toContain(`(item.value->>'weekday')::numeric`);
    expect(sql).toContain(`(item.value->>'startsAt')`);
    expect(sql).toMatch(/FROM jsonb_array_elements\(\$\d+::jsonb\) AS item/);
    expect(sql).toContain('RETURNING *');
  });

  it('binds the items as a JSON string, not a driver array literal', async () => {
    const { client, calls } = fakeClient();
    const days = [{ weekday: 1, startsAt: '18:00' }];
    await executeMutation(client, slots, { context: { name: 'Yoga', days }, scope, policy, schema });
    expect(calls[0]!.params).toContain(JSON.stringify(days));
  });

  it('pins scope rules as constants across every row', async () => {
    const { client, calls } = fakeClient();
    await executeMutation(client, slots, { context: { name: 'Yoga', days: [] }, scope, policy, schema });
    expect(calls[0]!.sql).toContain('studio_id');
    expect(calls[0]!.params).toContain('studio_1');
  });

  it('rejects a non-array items value loudly', async () => {
    const { client, calls } = fakeClient();
    await expect(
      executeMutation(client, slots, { context: { name: 'Yoga', days: 'monday' }, scope, policy, schema }),
    ).rejects.toThrow(/array/);
    expect(calls).toHaveLength(0);
  });

  it('requires the items key like any other context', () => {
    expect(requiredContextKeys(slots)).toEqual(['days', 'name']);
    const sig = collectMutationContext(slots, schema);
    expect(sig['days']!.type).toBe('json');
    expect(sig['days']!.note).toContain('weekday');
  });

  it('composes with onConflict', async () => {
    const { client, calls } = fakeClient();
    await executeMutation(
      client,
      {
        op: 'insertEach',
        table: 'memberships',
        items: { $context: 'rows' },
        values: { id: { $item: 'id' }, person_id: { $item: 'personId' } },
        onConflict: { target: ['studio_id', 'person_id'] },
      },
      { context: { rows: [{ id: 'm1', personId: 'p1' }] }, scope, policy, schema },
    );
    expect(calls[0]!.sql).toContain('ON CONFLICT (studio_id, person_id) DO NOTHING');
  });
});
