import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { introspectPostgres } from '../../src/adapters/postgres/introspect.js';
import { computeSchemaFingerprint } from '../../src/cache/hash.js';

// A table's and a column's COMMENT is what its author says it means — the one
// thing a query writer cannot get from a name. "members" does not say "the
// people in the room"; a comment can. Read against a real database, and kept
// out of the schema fingerprint: rewording a comment changes no query.

const DDL = `
  CREATE TABLE members (member_id TEXT PRIMARY KEY, name TEXT NOT NULL, gone TEXT);
  ALTER TABLE members DROP COLUMN gone;
  ALTER TABLE members ADD COLUMN title TEXT;
  CREATE TABLE plain (id TEXT PRIMARY KEY);
`;

describe('introspection reads comments as descriptions', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(DDL);
  });
  afterAll(async () => {
    await db.close();
  });

  it('a table comment is the entity description, a column comment the field description', async () => {
    await db.exec(`COMMENT ON TABLE members IS 'The people in the room'; COMMENT ON COLUMN members.title IS 'Their job title, as written on their card';`);
    const schema = await introspectPostgres(createPglitePool(db));
    const members = schema.entities.find((entity) => entity.name === 'members');
    expect(members?.description).toBe('The people in the room');
    // after a dropped column, a column's position is not its attribute number
    expect(members?.fields.find((field) => field.name === 'title')?.description).toBe('Their job title, as written on their card');
    expect(members?.fields.find((field) => field.name === 'name')?.description).toBeUndefined();
  });

  it('no comment, no description', async () => {
    const schema = await introspectPostgres(createPglitePool(db));
    expect(schema.entities.find((entity) => entity.name === 'plain')?.description).toBeUndefined();
  });

  it('rewording a comment leaves the schema fingerprint alone', async () => {
    const before = computeSchemaFingerprint(await introspectPostgres(createPglitePool(db)));
    await db.exec(`COMMENT ON TABLE members IS 'Everybody who stepped in'`);
    const after = computeSchemaFingerprint(await introspectPostgres(createPglitePool(db)));
    expect(after).toBe(before);
  });
});
