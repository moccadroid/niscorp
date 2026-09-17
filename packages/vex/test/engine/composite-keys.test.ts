import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { introspectPostgres } from '../../src/adapters/postgres/introspect.js';
import { compileQuery } from '../../src/adapters/postgres/compile.js';
import { resolve } from '../../src/engine/resolver.js';
import { executeQuery } from '../../src/engine/executor.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { Row } from '../../src/adapters/adapter.types.js';

// A composite foreign key is ONE relation with ordered pairs, and the join
// carries every pair. Read against a real database, because this is exactly
// what a hand-built schema fixture cannot catch: introspection paired every
// referencing column with every referenced one, the resolver joined on
// whichever pair came first, and a key referencing (id, account_id) — the
// referenced column that sorts before `id` is the trap — joined on the wrong
// column and matched nothing. Nothing failed; the read was simply empty.

const DDL = `
  CREATE TABLE accounts (id TEXT PRIMARY KEY);

  -- The same role name exists per account: only the whole key tells them apart.
  CREATE TABLE roles (
    id         TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts (id),
    PRIMARY KEY (id, account_id)
  );

  CREATE TABLE grants (
    role_id    TEXT NOT NULL,
    account_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    PRIMARY KEY (role_id, account_id, capability),
    FOREIGN KEY (role_id, account_id) REFERENCES roles (id, account_id)
  );

  -- One row per role: the key IS the primary key, so the reverse is hasOne.
  CREATE TABLE leads (
    role_id    TEXT NOT NULL,
    account_id TEXT NOT NULL,
    person     TEXT NOT NULL,
    PRIMARY KEY (role_id, account_id),
    FOREIGN KEY (role_id, account_id) REFERENCES roles (id, account_id)
  );

  -- One nullable column in the key: MATCH SIMPLE leaves the whole key
  -- unenforced for that row, and the row must survive the read.
  CREATE TABLE badges (
    label      TEXT PRIMARY KEY,
    role_id    TEXT,
    account_id TEXT NOT NULL,
    FOREIGN KEY (role_id, account_id) REFERENCES roles (id, account_id)
  );

  -- Two tables that reference each other: the first-declared key wins the join.
  CREATE TABLE teams (id TEXT PRIMARY KEY, lead_id TEXT);
  CREATE TABLE members (id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams (id));
  ALTER TABLE teams ADD FOREIGN KEY (lead_id) REFERENCES members (id);

  INSERT INTO accounts VALUES ('acme'), ('bolt');
  INSERT INTO roles VALUES ('admin', 'acme'), ('admin', 'bolt');
  INSERT INTO grants VALUES ('admin', 'acme', 'read'), ('admin', 'bolt', 'write');
  INSERT INTO leads VALUES ('admin', 'acme', 'ada');
  INSERT INTO badges VALUES ('gold', 'admin', 'acme'), ('plain', NULL, 'acme');
  INSERT INTO teams (id) VALUES ('t1');
  INSERT INTO members VALUES ('m1', 't1');
  UPDATE teams SET lead_id = 'm1';
`;

const db = new PGlite();
const pool = createPglitePool(db);
const adapter = createPostgresAdapter({ pool });
let schema: DatabaseSchema;

const read = async (dsl: Query): Promise<{ sql: string; rows: Row[] }> => {
  const compiled = compileQuery(resolve(dsl, schema));
  return { sql: compiled.sql, rows: await executeQuery(compiled, {}, {}, adapter) };
};

beforeAll(async () => {
  await db.exec(DDL);
  schema = await introspectPostgres(pool);
});

afterAll(() => db.close());

describe('a composite foreign key', () => {
  it('introspects as one relation with the pairs in the key\'s order', () => {
    const grants = schema.entities.find((e) => e.name === 'grants');
    expect(grants?.relations).toEqual([
      { type: 'belongsTo', entity: 'roles', localFields: ['role_id', 'account_id'], foreignFields: ['id', 'account_id'] },
    ]);
  });

  it('reverses to hasMany, or hasOne when the whole key is unique — not when one column is', () => {
    const roles = schema.entities.find((e) => e.name === 'roles');
    expect(roles?.relations).toContainEqual(
      { type: 'hasMany', entity: 'grants', localFields: ['id', 'account_id'], foreignFields: ['role_id', 'account_id'] },
    );
    expect(roles?.relations).toContainEqual(
      { type: 'hasOne', entity: 'leads', localFields: ['id', 'account_id'], foreignFields: ['role_id', 'account_id'] },
    );
    // grants' primary key is (role_id, account_id, capability): the referencing
    // columns are a subset of it, not a superset, so a role has many grants.
    // (The old flat-set test would have seen role_id in "some unique
    // constraint" and called it hasOne.)
    expect(roles?.relations.find((r) => r.entity === 'grants')?.type).toBe('hasMany');
  });

  it('joins on every pair, so the second column is enforced', async () => {
    const { sql, rows } = await read({
      from: ['grants', 'roles'],
      fields: ['grants.capability', 'roles.account_id'],
    });
    expect(sql).toContain('JOIN roles AS r1 ON g1.role_id = r1.id AND g1.account_id = r1.account_id');
    // A join on the first pair alone would pair each grant with BOTH admin
    // roles and return four rows.
    expect(rows.map((r) => [r['capability'], r['account_id']]).sort()).toEqual([
      ['read', 'acme'],
      ['write', 'bolt'],
    ]);
  });

  it('and in the reverse direction, reached through a three-table from', async () => {
    const { sql, rows } = await read({
      from: ['accounts', 'roles', 'grants'],
      fields: ['grants.capability'],
      filter: { eq: ['accounts.id', 'acme'] },
    });
    expect(sql).toContain('JOIN grants AS g1 ON r1.id = g1.role_id AND r1.account_id = g1.account_id');
    expect(rows.map((r) => r['capability'])).toEqual(['read']);
  });

  it('is LEFT when any of its columns is nullable, and the half-keyed row survives', async () => {
    const { sql, rows } = await read({
      from: ['badges', 'roles'],
      fields: ['badges.label', 'roles.id'],
    });
    expect(sql).toContain('LEFT JOIN roles AS r1 ON b1.role_id = r1.id AND b1.account_id = r1.account_id');
    expect(rows.map((r) => [r['label'], r['id']]).sort()).toEqual([
      ['gold', 'admin'],
      ['plain', null],
    ]);
  });
});

describe('two tables that reference each other both ways', () => {
  it('join on the first-declared key, whichever side the from starts on', async () => {
    // members → teams was declared first (teams → members is the ALTER after
    // it), so both reads express "a member's team" — never the team's lead.
    const forward = await read({ from: ['teams', 'members'], fields: ['members.id'] });
    expect(forward.sql).toContain('JOIN members AS m1 ON t1.id = m1.team_id');
    expect(forward.rows.map((r) => r['id'])).toEqual(['m1']);

    const backward = await read({ from: ['members', 'teams'], fields: ['teams.id'] });
    expect(backward.sql).toContain('JOIN teams AS t1 ON m1.team_id = t1.id');
    expect(backward.rows.map((r) => r['id'])).toEqual(['t1']);
  });
});
