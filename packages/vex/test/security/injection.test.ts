import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { executeQuery } from '../../src/engine/executor.js';
import { executeMutation } from '../../src/mutations/engine.js';
import { QuerySchema } from '../../src/schemas/query.schema.js';
import { MutationDefinitionSchema } from '../../src/mutations/schema.js';
import { VexError } from '../../src/errors.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { MutationDefinition } from '../../src/mutations/schema.js';
import type { Row } from '../../src/adapters/adapter.types.js';

// SQL INJECTION, attempted the way an attacker would: against a real Postgres,
// under a deny-by-default policy, with a table the caller may not read.
//
// Every string a query can carry reaches SQL one of three ways — a column that
// resolved against the schema, a quoted literal, or a quoted output name. These
// cases are the ways that used to be a fourth: a field position holding
// something that was not a column, and an output name holding a quote. The
// `secrets` table is denied; any case that returns its row has crossed the
// policy through the compiler rather than around it.
//
// Each read attack is asserted twice: the schema refuses it (what a model's
// output and a stored entry go through), and the engine refuses it anyway when
// handed the DSL directly (`engine.compile` never parses).

const DDL = `
  CREATE TABLE notes (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, body TEXT, score INT);
  CREATE TABLE secrets (id TEXT PRIMARY KEY, secret TEXT NOT NULL);
  INSERT INTO notes VALUES ('n1', 'acme', 'hello', 1), ('n2', 'bolt', 'other', 2), ('n3', 'acme', E'it''s a \\\\ back', 3);
  INSERT INTO secrets VALUES ('s1', 'hunter2');
`;

const policy: ScopePolicy = {
  default: 'deny',
  entities: {
    notes: {
      read: [{ match: 'tenant_id', to: 'tenantId' }],
      write: [{ match: 'tenant_id', to: 'tenantId' }],
    },
  },
};

const scope = { tenantId: 'acme' };
const SUBQUERY = '(SELECT secret FROM secrets LIMIT 1)';

const db = new PGlite();
const pool = createPglitePool(db);
const adapter = createPostgresAdapter({ pool });
const engine = createQueryEngine({ adapter, scope: policy });
let schema: DatabaseSchema;

const read = async (dsl: Query): Promise<Row[]> => executeQuery(engine.compile(dsl), {}, scope, adapter);

const write = (def: MutationDefinition, context: Record<string, unknown> = {}): Promise<Row[]> =>
  executeMutation(pool, def, { context, scope, policy, schema });

const refused = async (attempt: () => Promise<unknown>): Promise<void> => {
  await expect(attempt()).rejects.toBeInstanceOf(VexError);
};

beforeAll(async () => {
  await db.exec(DDL);
  schema = await engine.introspect();
});

afterAll(async () => {
  await db.close();
});

describe('the ordinary read still works', () => {
  it('returns the caller tenant and nobody else', async () => {
    const rows = await read({ from: ['notes'], fields: ['notes.id'], sort: [{ field: 'notes.id', dir: 'asc' }] });
    expect(rows.map((r) => r['id'])).toEqual(['n1', 'n3']);
  });
});

describe('a field position holds a column and nothing else', () => {
  const attacks: Record<string, Query> = {
    'isNotNull (the boolean oracle over a denied table)': {
      from: ['notes'],
      fields: ['notes.id'],
      filter: { isNotNull: `(SELECT secret FROM secrets WHERE secret LIKE 'h%' LIMIT 1)` },
    },
    isNull: { from: ['notes'], fields: ['notes.id'], filter: { isNull: SUBQUERY } },
    in: { from: ['notes'], fields: ['notes.id'], filter: { in: [SUBQUERY, ['hunter2']] } },
    notIn: { from: ['notes'], fields: ['notes.id'], filter: { notIn: [SUBQUERY, ['x']] } },
    like: { from: ['notes'], fields: ['notes.id'], filter: { like: [SUBQUERY, 'h%'] } },
    ilike: { from: ['notes'], fields: ['notes.id'], filter: { ilike: [SUBQUERY, 'h%'] } },
    fuzzy: { from: ['notes'], fields: ['notes.id'], filter: { fuzzy: { field: SUBQUERY, query: { $context: 'q' } } } },
    count: { from: ['notes'], aggregate: { n: { count: SUBQUERY } } },
    sum: { from: ['notes'], aggregate: { n: { max: SUBQUERY } } },
    groupBy: { from: ['notes'], aggregate: { n: { count: '*' } }, groupBy: [SUBQUERY] },
    'a dotted string that is not a name': { from: ['notes'], fields: ['notes.id'], filter: { isNull: 'notes.id) OR (1=1' } },
  };

  for (const [name, dsl] of Object.entries(attacks)) {
    it(`${name}: the schema refuses it`, () => {
      expect(QuerySchema.safeParse(dsl).success).toBe(false);
    });
    it(`${name}: the engine refuses it without the schema`, async () => {
      await refused(() => read(dsl));
    });
  }
});

describe('an output name is a name', () => {
  const attacks: Record<string, Query> = {
    'field alias': { from: ['notes'], fields: [{ field: 'notes.id', as: `x", ${SUBQUERY} AS "y` }] },
    'compute name': { from: ['notes'], fields: ['notes.id'], compute: { [`x", ${SUBQUERY} AS "y`]: { concat: ['notes.body', '!'] } } },
    'aggregate name': { from: ['notes'], aggregate: { [`n", ${SUBQUERY} AS "y`]: { count: '*' } } },
    'subquery alias': {
      from: [{ as: `s, secrets AS x --`, query: { from: ['notes'], fields: ['notes.id'] } }],
      fields: [`s, secrets AS x --.id`],
    },
  };

  for (const [name, dsl] of Object.entries(attacks)) {
    it(`${name}: the schema refuses it`, () => {
      expect(QuerySchema.safeParse(dsl).success).toBe(false);
    });
    it(`${name}: the engine refuses it without the schema`, async () => {
      await refused(() => read(dsl));
    });
  }

  it('a LIMIT that is not an integer never reaches the statement', async () => {
    const dsl: Query = JSON.parse(`{ "from": ["notes"], "fields": ["notes.id"], "limit": "1; DROP TABLE notes" }`);
    await refused(() => read(dsl));
  });
});

describe('a literal is a literal, whatever the server thinks a backslash means', () => {
  const byBody = (body: string): Query => ({ from: ['notes'], fields: ['notes.id'], filter: { eq: ['notes.body', body] } });

  for (const setting of ['on', 'off']) {
    describe(`standard_conforming_strings = ${setting}`, () => {
      beforeAll(async () => {
        await db.exec(`SET standard_conforming_strings = ${setting}`);
      });
      afterAll(async () => {
        await db.exec('SET standard_conforming_strings = on');
      });

      it('a quote and a backslash round-trip exactly', async () => {
        expect((await read(byBody(`it's a \\ back`))).map((r) => r['id'])).toEqual(['n3']);
      });

      it('a backslash cannot close the string', async () => {
        expect(await read(byBody(`x\\' OR true --`))).toEqual([]);
      });
    });
  }

  it('a string with a dot that is not a name is a literal, not an unknown entity', async () => {
    expect(await read(byBody('u1@x.com'))).toEqual([]);
  });
});

describe('a write filters on its own table’s columns', () => {
  it('a WHERE naming another table is refused', async () => {
    await refused(() => write({ op: 'update', table: 'notes', set: { body: 'x' }, where: { eq: ['secrets.secret', 'hunter2'] } }));
  });

  it('a WHERE naming a column the table does not have is refused', async () => {
    await refused(() => write({ op: 'update', table: 'notes', set: { body: 'x' }, where: { eq: ['notes.nope', 'x'] } }));
  });

  it('a field position that is not a column never parses', () => {
    expect(MutationDefinitionSchema.safeParse({ op: 'delete', table: 'notes', where: { isNull: SUBQUERY } }).success).toBe(false);
  });

  it('a quote in a compared value binds as a literal and touches nothing', async () => {
    const rows = await write({ op: 'update', table: 'notes', set: { body: 'owned' }, where: { eq: ['notes.id', `x' OR '1'='1`] } });
    expect(rows).toEqual([]);
    const untouched = await read({ from: ['notes'], fields: ['notes.body'], filter: { eq: ['notes.id', 'n1'] } });
    expect(untouched[0]?.['body']).toBe('hello');
  });
});
