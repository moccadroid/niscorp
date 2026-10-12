import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { executeWrites } from '../../src/mutations/engine.js';
import { collectMutationContext } from '../../src/mutations/signature.js';
import type { MutationDefinition } from '../../src/mutations/schema.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

const DDL = `
  CREATE TABLE people (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    name text
  );
`;

const policy: ScopePolicy = { default: 'deny', entities: { people: { public: true } } };

const def: MutationDefinition = {
  op: 'insert',
  table: 'people',
  values: { email: { $context: 'email' }, name: { $context: 'name' } },
  onConflict: { target: ['email'], set: { name: { $context: 'newName' } } },
};

const db = new PGlite();
const pool = createPglitePool(db);
let schema: DatabaseSchema;

beforeAll(async () => {
  await db.exec(DDL);
  schema = await createPostgresAdapter({ pool }).introspect();
});

afterAll(async () => {
  await db.close();
});

describe('an insert whose onConflict.set sets a column its values set too', () => {
  it('is refused without the key its values bind, and writes nothing (this used to land a NULL)', async () => {
    const attempt = executeWrites(pool, def, { context: { email: 'z@example.test', newName: 'only this was sent' }, scope: {}, policy, schema });
    await expect(attempt).rejects.toMatchObject({ code: 'missing_context', message: 'Mutation is missing context: name.' });
    expect((await db.query('SELECT name FROM people')).rows).toEqual([]);
  });

  it('lists both keys in the derived signature', () => {
    expect(Object.keys(collectMutationContext(def, schema)).sort()).toEqual(['email', 'name', 'newName']);
  });
});

describe('an upsert whose insert sets a column its columns set too', () => {
  it('lists the key each half binds, and only the insert half as insert only', () => {
    const sig = collectMutationContext(
      { op: 'upsert', table: 'people', key: 'id', columns: { name: { $context: 'name' } }, insert: { email: { $context: 'email' }, name: { $context: 'firstName' } } },
      schema,
    );
    expect(Object.keys(sig).sort()).toEqual(['email', 'firstName', 'id', 'name']);
    expect(sig['name']).toEqual({ type: 'string', column: 'people.name' });
    expect(sig['firstName']).toEqual({ type: 'string', column: 'people.name', note: 'insert only' });
  });

  it('does not call a key insert only when the update binds it too', () => {
    const sig = collectMutationContext({ op: 'upsert', table: 'people', key: 'id', columns: { name: { $context: 'name' } }, insert: { name: { $context: 'name' } } }, schema);
    expect(sig['name']).toEqual({ type: 'string', column: 'people.name' });
  });
});
