import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { handleQuery } from '../../src/handler.js';
import { executeWrites, executeMutation } from '../../src/mutations/engine.js';
import { MutationDefinitionSchema } from '../../src/mutations/schema.js';
import { collectMutationContext, lintMutation, mutationEffect, requiredContextKeys } from '../../src/mutations/signature.js';
import { VexError } from '../../src/errors.js';
import type { MutationClient } from '../../src/mutations/engine.js';
import type { MutationDefinition } from '../../src/mutations/schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

// `{ $returned: 'table.column' }` — a later statement of a batch reading the
// row an earlier one wrote. Against a real database, because what is being
// held is what LANDS: the value in the column, the rows a refused batch leaves
// behind (none), and whose tenant a row ends up in.

const DDL = `
  CREATE TABLE lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL,
    title text NOT NULL,
    tags jsonb
  );
  CREATE TABLE items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL,
    list_id uuid NOT NULL REFERENCES lists (id),
    label text NOT NULL,
    tags jsonb
  );
  CREATE TABLE notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL,
    list_id uuid NOT NULL REFERENCES lists (id),
    item_id uuid REFERENCES items (id),
    body text NOT NULL
  );
  CREATE TABLE people (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    name text NOT NULL
  );
  CREATE TABLE memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL,
    person_id uuid NOT NULL REFERENCES people (id),
    UNIQUE (tenant_id, person_id)
  );
`;

const tenant = [{ match: 'tenant_id', to: 'tenantId' }];
const policy: ScopePolicy = {
  default: 'deny',
  entities: {
    lists: { read: tenant, write: tenant },
    items: { read: tenant, write: tenant },
    notes: { read: tenant, write: tenant },
    memberships: { read: tenant, write: tenant },
    people: { public: true },
  },
};
const A = { tenantId: 'tenant-a' };
const B = { tenantId: 'tenant-b' };

const world = async () => {
  const db = new PGlite();
  await db.exec(DDL);
  const pool = createPglitePool(db);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool }), cache: createMemoryCache(), scope: policy });
  const schema = await engine.introspect();
  warn.mockRestore();
  const run = (def: MutationDefinition, context: Record<string, unknown>, scope: Record<string, unknown> = A) =>
    executeWrites(pool, def, { context, scope, policy, schema });
  const count = async (table: string): Promise<number> => Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n ?? -1);
  return { db, pool, engine, schema, run, count };
};

const refusal = async (attempt: Promise<unknown>): Promise<VexError> => {
  const outcome = await attempt.then(
    () => undefined,
    (err: unknown) => err,
  );
  if (!(outcome instanceof VexError)) throw new Error(`expected a VexError, got ${String(outcome)}`);
  return outcome;
};

// A parent whose id the database generates, and the rows that point at it.
const listWithItems: MutationDefinition = [
  { op: 'insert', table: 'lists', values: { title: { $context: 'title' } } },
  { op: 'insertEach', table: 'items', items: { $context: 'items' }, values: { list_id: { $returned: 'lists.id' }, label: { $item: 'label' } } },
  { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: { $context: 'note' } } },
];

describe('$returned — a later statement reads the row an earlier one wrote', () => {
  it('a parent and its children land as one batch, the children carrying the generated id', async () => {
    const { run } = await world();
    const [list, items, notes] = await run(listWithItems, { title: 'Groceries', items: [{ label: 'milk' }, { label: 'eggs' }], note: 'for the weekend' });
    const id = list?.rows[0]?.['id'];
    expect(typeof id).toBe('string');
    expect(items?.rows.map((row) => row['list_id'])).toEqual([id, id]);
    expect(notes?.rows[0]?.['list_id']).toBe(id);
    // Each row is in the caller's tenant because the ENGINE put it there.
    expect([...(items?.rows ?? []), ...(notes?.rows ?? [])].map((row) => row['tenant_id'])).toEqual(['tenant-a', 'tenant-a', 'tenant-a']);
  });

  it('needs no natural key: the same call again is a second parent', async () => {
    const { run, count } = await world();
    const context = { title: 'Same title', items: [], note: 'n' };
    const first = await run(listWithItems, context);
    const second = await run(listWithItems, context);
    expect(second[0]?.rows[0]?.['id']).not.toBe(first[0]?.rows[0]?.['id']);
    expect(await count('lists')).toBe(2);
    expect(await count('notes')).toBe(2);
  });

  it('a reference can read a row a reference helped write', async () => {
    const { run } = await world();
    const [list, item, note] = await run(
      [
        { op: 'insert', table: 'lists', values: { title: 'Chain' } },
        { op: 'insert', table: 'items', values: { list_id: { $returned: 'lists.id' }, label: 'first' } },
        { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, item_id: { $returned: 'items.id' }, body: 'about the first' } },
      ],
      {},
    );
    expect(note?.rows[0]?.['list_id']).toBe(list?.rows[0]?.['id']);
    expect(note?.rows[0]?.['item_id']).toBe(item?.rows[0]?.['id']);
  });

  it('is all or nothing: a later statement failing leaves no parent behind', async () => {
    const { run, count } = await world();
    const failing: MutationDefinition = [
      { op: 'insert', table: 'lists', values: { title: 'Orphan' } },
      { op: 'insert', table: 'items', values: { list_id: { $returned: 'lists.id' }, label: 'kept?' } },
      // No such item: the foreign key refuses the third statement.
      { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, item_id: '00000000-0000-4000-8000-000000000000', body: 'x' } },
    ];
    await expect(run(failing, {})).rejects.toThrow(/foreign key/);
    expect(await count('lists')).toBe(0);
    expect(await count('items')).toBe(0);
  });

  it('the value comes from the row, never from the request', async () => {
    const { run } = await world();
    // A context key spelled exactly like the reference is not the reference.
    const writes = await run(listWithItems, { title: 'T', items: [{ label: 'x' }], note: 'n', 'lists.id': '11111111-1111-4111-8111-111111111111' });
    expect(writes[1]?.rows[0]?.['list_id']).toBe(writes[0]?.rows[0]?.['id']);
    expect(writes[1]?.rows[0]?.['list_id']).not.toBe('11111111-1111-4111-8111-111111111111');
  });
});

describe('$returned — exactly one row, or nothing is written', () => {
  const retitleAndNote: MutationDefinition = [
    { op: 'update', table: 'lists', set: { title: { $context: 'title' } }, where: { eq: ['lists.id', { $context: 'listId' }] } },
    { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: { $context: 'note' } } },
  ];

  it('a statement that wrote no row refuses the batch, and names why', async () => {
    const { run, count } = await world();
    const err = await refusal(run(retitleAndNote, { listId: '00000000-0000-4000-8000-000000000000', title: 'x', note: 'n' }));
    expect(err.code).toBe('execution_error');
    expect(err.message).toContain('"lists.id" needs exactly one row from statement 1');
    expect(err.details).toEqual({ returned: 'lists.id', rows: 0 });
    expect(await count('notes')).toBe(0);
  });

  it('another tenant naming this tenant\'s row: fenced to nothing, refused, nothing changed', async () => {
    const { run, db, count } = await world();
    const [made] = await run([{ op: 'insert', table: 'lists', values: { title: 'Ours' } }, { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'first' } }], {});
    const listId = made?.rows[0]?.['id'];

    const err = await refusal(run(retitleAndNote, { listId, title: 'Theirs now', note: 'planted' }, B));
    expect(err.code).toBe('execution_error');
    expect((await db.query<{ title: string }>('SELECT title FROM lists WHERE id = $1', [listId])).rows[0]?.title).toBe('Ours');
    expect(await count('notes')).toBe(1);

    // The same batch from the tenant that owns the row.
    const writes = await run(retitleAndNote, { listId, title: 'Still ours', note: 'second' });
    expect(writes.map((write) => `${write.op} ${write.table}:${write.rows.length}`)).toEqual(['update lists:1', 'insert notes:1']);
  });

  it('a client that hands rows back under other keys: refused, never NULL', async () => {
    const { pool, schema, count } = await world();
    // Every column name upper-cased on the way out — what a row-renaming
    // driver option does to the engine's view of a row.
    const renamed = (rows: Record<string, unknown>[]): Record<string, unknown>[] => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toUpperCase(), value])));
    const renaming: MutationClient = {
      query: async (sql, params = []) => ({ rows: renamed((await pool.query(sql, params)).rows) }),
      transaction: (fn) => {
        if (pool.transaction === undefined) throw new Error('the pool cannot transact');
        return pool.transaction((tx) => fn({ query: async (sql, params = []) => ({ rows: renamed((await tx.query(sql, params)).rows) }) }));
      },
    };
    const err = await refusal(executeWrites(renaming, listWithItems, { context: { title: 'T', items: [{ label: 'x' }], note: 'n' }, scope: A, policy, schema }));
    expect(err.code).toBe('execution_error');
    expect(err.message).toContain('has no "id" key');
    expect(await count('lists')).toBe(0);
  });

  it('several rows refuse it too, and the update that produced them is undone', async () => {
    const { run, db } = await world();
    await run([{ op: 'insert', table: 'lists', values: { title: 'one' } }, { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'n' } }], {});
    await run([{ op: 'insert', table: 'lists', values: { title: 'two' } }, { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'n' } }], {});
    const err = await refusal(
      run(
        [
          { op: 'update', table: 'lists', set: { title: 'both' }, where: { neq: ['lists.title', { $context: 'not' }] } },
          { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'which one?' } },
        ],
        { not: 'nothing' },
      ),
    );
    expect(err.details).toEqual({ returned: 'lists.id', rows: 2 });
    expect((await db.query<{ title: string }>('SELECT title FROM lists ORDER BY title')).rows.map((row) => row.title)).toEqual(['one', 'two']);
  });

  it('create-or-fetch returns the row on both paths, so the reference holds either way', async () => {
    const { run, count } = await world();
    const ensureMember: MutationDefinition = [
      { op: 'insert', table: 'people', values: { email: { $context: 'email' }, name: { $context: 'name' } }, onConflict: { target: ['email'], set: { email: { $context: 'email' } } } },
      { op: 'insert', table: 'memberships', values: { person_id: { $returned: 'people.id' } }, onConflict: { target: ['tenant_id', 'person_id'] } },
    ];
    const fresh = await run(ensureMember, { email: 'new@example.test', name: 'New' });
    const known = await run(ensureMember, { email: 'new@example.test', name: 'New' }, B);
    expect(known[0]?.rows[0]?.['id']).toBe(fresh[0]?.rows[0]?.['id']);
    expect(await count('people')).toBe(1);
    expect(await count('memberships')).toBe(2);
  });
});

describe('$returned — scope', () => {
  it('a reference aimed at a scope-pinned column loses to the engine', async () => {
    const { run } = await world();
    const writes = await run(
      [
        { op: 'insert', table: 'lists', values: { title: 'tenant-b' } },
        // The author tries to take the tenant from the earlier row's title.
        { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, tenant_id: { $returned: 'lists.title' }, body: 'n' } },
      ],
      {},
    );
    expect(writes[1]?.rows[0]?.['tenant_id']).toBe('tenant-a');
  });

  it('a table the caller may not write refuses the whole batch before anything runs', async () => {
    const { pool, schema, count } = await world();
    const readOnlyNotes: ScopePolicy = { default: 'deny', entities: { lists: { read: tenant, write: tenant }, notes: { read: tenant } } };
    const attempt = executeWrites(
      pool,
      [{ op: 'insert', table: 'lists', values: { title: 'x' } }, { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'n' } }],
      { context: {}, scope: A, policy: readOnlyNotes, schema },
    );
    await expect(attempt).rejects.toThrow(/not allowed by scope policy/);
    expect(await count('lists')).toBe(0);
  });
});

describe('$returned — refused before any request', () => {
  const issuesOf = (def: MutationDefinition): string => lintMutation(def).join(' | ');

  it('a reference with nothing earlier to read — in a batch, or in a statement on its own', () => {
    expect(issuesOf([{ op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'n' } }])).toContain('no earlier statement writes "lists"');
    expect(issuesOf({ op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'n' } })).toContain('no earlier statement writes "lists"');
    // Pointing forwards is the same thing.
    expect(
      issuesOf([
        { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'n' } },
        { op: 'insert', table: 'lists', values: { title: 'late' } },
      ]),
    ).toContain('no earlier statement writes "lists"');
  });

  it('the refusal says what to do, and a reference used for two columns is refused once', () => {
    expect(lintMutation([{ op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, item_id: { $returned: 'lists.id' }, body: 'n' } }])).toEqual([
      'insert on "notes" reads "lists.id", and no earlier statement writes "lists" — put the statement that writes it before this one, in the same batch',
    ]);
  });

  it('two earlier statements on the one table — there is no telling which', () => {
    expect(
      issuesOf([
        { op: 'insert', table: 'lists', values: { title: 'a' } },
        { op: 'insert', table: 'lists', values: { title: 'b' } },
        { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'n' } },
      ]),
    ).toContain('2 earlier statements write "lists"');
  });

  it('an insertEach, and an insert that does nothing on conflict', () => {
    expect(
      issuesOf([
        { op: 'insertEach', table: 'lists', items: { $context: 'rows' }, values: { title: { $item: 'title' } } },
        { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'n' } },
      ]),
    ).toContain('from an insertEach');
    expect(
      issuesOf([
        { op: 'insert', table: 'people', values: { email: 'a@example.test', name: 'A' }, onConflict: { target: ['email'] } },
        { op: 'insert', table: 'memberships', values: { person_id: { $returned: 'people.id' } } },
      ]),
    ).toContain('does nothing on conflict');
  });

  // An insert sets a column in two places — `values`, and `onConflict.set`.
  // Each is checked on its own: a reference in one is not excused by the same
  // column appearing in the other.
  const behindTheSameColumn: MutationDefinition = [
    { op: 'insert', table: 'lists', values: { title: 'x' } },
    {
      op: 'insert',
      table: 'people',
      values: { email: { $context: 'email' }, name: { $returned: 'nowhere.id' } },
      onConflict: { target: ['email'], set: { name: { $context: 'name' } } },
    },
  ];

  it('a reference in `values` is seen even when `onConflict.set` sets the same column', () => {
    expect(issuesOf(behindTheSameColumn)).toContain('no earlier statement writes "nowhere"');
  });

  it('…and the engine never fills it from the request', async () => {
    const { run, count } = await world();
    const err = await refusal(run(behindTheSameColumn, { email: 'p@example.test', name: 'n', 'nowhere.id': 'sent by the caller' }));
    expect(err.code).toBe('invalid_dsl');
    expect(await count('people')).toBe(0);
    expect(await count('lists')).toBe(0);
  });

  it('the seed refuses such an entry', async () => {
    const seeding = seedCache(createMemoryCache(), [{ fingerprint: 'notes/add', mutation: { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'n' } } }]);
    await expect(seeding).rejects.toThrow(/fails the authoring lint/);
  });

  it('a batch that reads nothing is linted exactly as before', () => {
    expect(lintMutation([{ op: 'insert', table: 'lists', values: { title: 'a' } }, { op: 'insert', table: 'lists', values: { title: 'b' } }])).toEqual([]);
  });

  it('the engine holds the same rule for a definition that was never seeded', async () => {
    const { pool, schema, count } = await world();
    const attempt = executeMutation(pool, [{ op: 'insert', table: 'lists', values: { title: 'a' } }, { op: 'insert', table: 'lists', values: { title: 'b' } }, { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: 'n' } }], {
      context: {},
      scope: A,
      policy,
      schema,
    });
    expect((await refusal(attempt)).code).toBe('invalid_dsl');
    expect(await count('lists')).toBe(0);
  });

  it('a column the earlier table does not have, before any SQL runs', async () => {
    const { run, count } = await world();
    const err = await refusal(run([{ op: 'insert', table: 'lists', values: { title: 'x' } }, { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.uid' }, body: 'n' } }], {}));
    expect(err.code).toBe('invalid_dsl');
    expect(err.message).toContain('Unknown column "lists.uid" in $returned');
    expect(await count('lists')).toBe(0);
  });

  it('the grammar takes `table.column` and nothing looser', () => {
    expect(MutationDefinitionSchema.safeParse([{ op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' } } }]).success).toBe(true);
    expect(MutationDefinitionSchema.safeParse([{ op: 'insert', table: 'notes', values: { list_id: { $returned: 'id' } } }]).success).toBe(false);
    expect(MutationDefinitionSchema.safeParse([{ op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id', extra: true } } }]).success).toBe(false);
  });

  it('it is a value a statement SETS — not a condition, not a lookup\'s, not the rows of an insertEach', () => {
    const list = { op: 'insert', table: 'lists', values: { title: 'x' } };
    const places = (value: unknown): unknown[] => [
      { op: 'update', table: 'notes', set: { body: 'b' }, where: { eq: ['notes.list_id', value] } },
      { op: 'delete', table: 'notes', where: { eq: ['notes.list_id', value] } },
      { op: 'insert', table: 'notes', values: { body: 'b', list_id: { $lookup: { from: 'lists', field: 'id', where: { eq: ['lists.id', value] } } } } },
      { op: 'insertEach', table: 'notes', items: value, values: { body: 'b' } },
    ];
    const parses = (value: unknown): boolean[] => places(value).map((statement) => MutationDefinitionSchema.safeParse([list, statement]).success);
    // The same four statements with a caller's value there are fine: it is the
    // reference each one refuses.
    expect(parses({ $context: 'listId' })).toEqual([true, true, true, true]);
    expect(parses({ $returned: 'lists.id' })).toEqual([false, false, false, false]);
  });
});

describe('$returned — everywhere a statement sets a column', () => {
  it('an update\'s set, an upsert\'s columns, and a row an upsert wrote', async () => {
    const { run } = await world();
    const [list, item] = await run(
      [
        // No `id` in context, so the upsert inserts — and is read like any insert.
        { op: 'upsert', table: 'lists', key: 'id', columns: { title: { $context: 'title' } } },
        { op: 'upsert', table: 'items', key: 'itemId', columns: { label: { $context: 'label' } }, insert: { list_id: { $returned: 'lists.id' } } },
      ],
      { title: 'Upserted', label: 'child' },
    );
    expect(item?.rows[0]?.['list_id']).toBe(list?.rows[0]?.['id']);

    const moved = await run(
      [
        { op: 'insert', table: 'lists', values: { title: 'Target' } },
        { op: 'update', table: 'items', set: { list_id: { $returned: 'lists.id' } }, where: { eq: ['items.id', { $context: 'itemId' }] } },
      ],
      { itemId: item?.rows[0]?.['id'] },
    );
    expect(moved[1]?.rows[0]?.['list_id']).toBe(moved[0]?.rows[0]?.['id']);
  });

  it('a delete hands on the row it removed', async () => {
    const { run, count } = await world();
    const [, item] = await run(
      [
        { op: 'insert', table: 'lists', values: { title: 'L' } },
        { op: 'insert', table: 'items', values: { list_id: { $returned: 'lists.id' }, label: 'done with this' } },
      ],
      {},
    );
    const [removed, note] = await run(
      [
        { op: 'delete', table: 'items', where: { eq: ['items.id', { $context: 'itemId' }] } },
        { op: 'insert', table: 'notes', values: { list_id: { $returned: 'items.list_id' }, body: { $returned: 'items.label' } } },
      ],
      { itemId: item?.rows[0]?.['id'] },
    );
    expect(removed?.op).toBe('delete');
    expect(note?.rows[0]).toMatchObject({ body: 'done with this', list_id: item?.rows[0]?.['list_id'] });
    expect(await count('items')).toBe(0);
  });

  it('an insert\'s onConflict set takes one as well', async () => {
    const { run, db } = await world();
    const [first] = await run({ op: 'insert', table: 'people', values: { email: { $context: 'email' }, name: 'Before' } }, { email: 'p@example.test' });
    // The second statement conflicts with the row that is already there, and
    // its `set` takes the name from the row the first statement wrote.
    await run(
      [
        { op: 'insert', table: 'lists', values: { title: 'After' } },
        { op: 'insert', table: 'people', values: { email: { $context: 'email' }, name: 'ignored' }, onConflict: { target: ['email'], set: { name: { $returned: 'lists.title' } } } },
      ],
      { email: 'p@example.test' },
    );
    expect((await db.query<{ name: string }>('SELECT name FROM people WHERE id = $1', [first?.rows[0]?.['id']])).rows[0]?.name).toBe('After');
  });

  it('into a json column it binds as JSON text, as a caller\'s value does', async () => {
    const { pool, schema } = await world();
    const sent: unknown[][] = [];
    const recording: MutationClient = {
      query: (sql, params = []) => {
        sent.push(params);
        return pool.query(sql, params);
      },
      transaction: (fn) => {
        if (pool.transaction === undefined) throw new Error('the pool cannot transact');
        return pool.transaction((tx) => fn({ query: (sql, params = []) => { sent.push(params); return tx.query(sql, params); } }));
      },
    };
    await executeWrites(
      recording,
      [
        { op: 'insert', table: 'lists', values: { title: 'tagged', tags: { $context: 'tags' } } },
        { op: 'insert', table: 'items', values: { list_id: { $returned: 'lists.id' }, label: 'copy', tags: { $returned: 'lists.tags' } } },
      ],
      { context: { tags: ['a', 'b'] }, scope: A, policy, schema },
    );
    // The second statement's `tags` parameter: text, not a driver's ARRAY literal.
    expect(sent[1]).toContain('["a","b"]');

    // The same for a reference that is an insertEach's constant value.
    sent.length = 0;
    await executeWrites(
      recording,
      [
        { op: 'insert', table: 'lists', values: { title: 'tagged again', tags: { $context: 'tags' } } },
        { op: 'insertEach', table: 'items', items: { $context: 'items' }, values: { list_id: { $returned: 'lists.id' }, label: { $item: 'label' }, tags: { $returned: 'lists.tags' } } },
      ],
      { context: { tags: ['c'], items: [{ label: 'one' }, { label: 'two' }] }, scope: A, policy, schema },
    );
    expect(sent[1]).toContain('["c"]');
  });
});

describe('$returned — what the rest of the stack is told', () => {
  it('it is not a context key, and the column it fills is one the entry writes', () => {
    expect(Object.keys(collectMutationContext(listWithItems)).sort()).toEqual(['items', 'note', 'title']);
    expect(requiredContextKeys({ op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: { $context: 'note' } } })).toEqual(['note']);
    expect(mutationEffect(listWithItems)).toEqual([
      { op: 'insert', table: 'lists', columns: ['title'] },
      { op: 'insertEach', table: 'items', columns: ['label', 'list_id'] },
      { op: 'insert', table: 'notes', columns: ['body', 'list_id'] },
    ]);
  });

  it('through the handler: one observer call after the commit, none for a refused batch', async () => {
    const { engine, pool } = await world();
    await seedCache(engine.cache, [
      { fingerprint: 'lists/with-items', mutation: listWithItems },
      {
        fingerprint: 'lists/retitle-and-note',
        mutation: [
          { op: 'update', table: 'lists', set: { title: { $context: 'title' } }, where: { eq: ['lists.id', { $context: 'listId' }] } },
          { op: 'insert', table: 'notes', values: { list_id: { $returned: 'lists.id' }, body: { $context: 'note' } } },
        ],
      },
    ]);
    const onWrite = vi.fn();
    const invalidate = vi.spyOn(engine, 'invalidate');
    const config = { engine, locked: true, scopePolicy: policy, mutations: { client: pool, policy, onWrite } };

    const made = await handleQuery(config, { fingerprint: 'lists/with-items', context: { title: 'T', items: [{ label: 'x' }], note: 'n' } }, A);
    expect(made.status).toBe(200);
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);

    const refused = await handleQuery(config, { fingerprint: 'lists/retitle-and-note', context: { listId: '00000000-0000-4000-8000-000000000000', title: 'x', note: 'n' } }, A);
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ error: 'execution_error', details: { returned: 'lists.id', rows: 0 } });
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    engine.rows.stop();
  });
});
