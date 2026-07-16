import { describe, it, expect } from 'vitest';
import { executeMutation } from '../../src/mutations/engine.js';
import type { MutationClient } from '../../src/mutations/engine.js';
import { MutationDefinitionSchema } from '../../src/mutations/schema.js';
import { VexError } from '../../src/errors.js';
import { VexScopeError } from '../../src/scope/apply.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

// ─── Fixtures ───────────────────────────────────────────────────

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
      name: 'tasks',
      table: 'tasks',
      fields: [field('id', 'string', true), field('title'), field('due_date', 'date'), field('done', 'boolean'), field('assignee_id'), field('deal_id')],
      relations: [],
      indexes: [],
    },
    {
      name: 'companies',
      table: 'companies',
      fields: [field('id', 'string', true), field('name'), field('owner_id')],
      relations: [],
      indexes: [],
    },
  ],
};

const policy: ScopePolicy = {
  default: 'deny',
  entities: {
    companies: { write: [{ set: 'owner_id', to: 'userId' }] },
    tasks: {
      write: [
        { set: 'assignee_id', to: 'userId' },
        { match: 'assignee_id', to: 'userId' },
      ],
    },
  },
};

type Call = { sql: string; params: unknown[] };
const fakeClient = (opts?: { rows?: unknown[]; transactional?: boolean }) => {
  const calls: Call[] = [];
  let inTx = false;
  let txUsed = false;
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return { rows: opts?.rows ?? [{ id: 'row_1' }] };
  };
  const client: MutationClient = {
    query,
    ...(opts?.transactional === true
      ? {
          transaction: async <T>(fn: (tx: { query: typeof query }) => Promise<T>): Promise<T> => {
            txUsed = true;
            inTx = true;
            const out = await fn({ query });
            inTx = false;
            return out;
          },
        }
      : {}),
  };
  return { client, calls, wasTx: () => txUsed, isInTx: () => inTx };
};

const upsertTask = {
  op: 'upsert' as const,
  table: 'tasks',
  key: 'id',
  columns: { title: { $context: 'title' }, due_date: { $context: 'due_date' } },
  insert: { deal_id: { $context: 'deal_id' } },
};

// ─── Grammar ────────────────────────────────────────────────────

describe('mutation grammar', () => {
  it('rejects $scope in authored values', () => {
    expect(() => MutationDefinitionSchema.parse({ op: 'insert', table: 'companies', values: { owner_id: { $scope: 'userId' } } })).toThrow();
  });

  it('rejects an update with an empty WHERE', () => {
    expect(() => MutationDefinitionSchema.parse({ op: 'update', table: 'companies', set: { name: 'x' }, where: {} })).toThrow();
  });

  it('rejects a write that sets no columns', () => {
    expect(() => MutationDefinitionSchema.parse({ op: 'insert', table: 'companies', values: {} })).toThrow();
  });
});

// ─── Scope (engine-applied, never authored) ─────────────────────

describe('scopeMutation via executeMutation', () => {
  it('stamps identity on insert from the policy set rule', async () => {
    const { client, calls } = fakeClient();
    await executeMutation(client, { op: 'insert', table: 'companies', values: { name: { $context: 'name' } } }, {
      context: { name: 'Probe Inc' },
      scope: { userId: 'usr_1' },
      policy,
      schema,
    });
    expect(calls[0]!.sql).toContain('owner_id');
    expect(calls[0]!.params).toContain('usr_1');
    expect(calls[0]!.params).toContain('Probe Inc');
  });

  it('pins update/delete WHERE to the scope match rule', async () => {
    const { client, calls } = fakeClient();
    await executeMutation(client, { op: 'delete', table: 'tasks', where: { eq: ['tasks.id', { $context: 'id' }] } }, {
      context: { id: 'task_1' },
      scope: { userId: 'usr_1' },
      policy,
      schema,
    });
    expect(calls[0]!.sql).toMatch(/assignee_id\s*=/);
    expect(calls[0]!.params).toContain('usr_1');
  });

  it('denies writes to an unlisted table under default deny', async () => {
    const { client } = fakeClient();
    await expect(
      executeMutation(client, { op: 'insert', table: 'stages', values: { name: 'x' } }, { context: {}, scope: {}, policy, schema }),
    ).rejects.toThrow(VexScopeError);
  });
});

// ─── Validation ─────────────────────────────────────────────────

describe('validation gates', () => {
  it('rejects an unknown column before any SQL runs', async () => {
    const { client, calls } = fakeClient();
    await expect(
      executeMutation(client, { op: 'insert', table: 'companies', values: { naem: 'x' } }, { context: {}, scope: { userId: 'u' }, policy, schema }),
    ).rejects.toThrow(VexError);
    expect(calls).toHaveLength(0);
  });

  it('hard-fails missing context with the FULL derived signature', async () => {
    const { client, calls } = fakeClient();
    let caught: VexError | undefined;
    try {
      await executeMutation(client, upsertTask, { context: { id: '' }, scope: { userId: 'u' }, policy, schema });
    } catch (e) {
      caught = e as VexError;
    }
    expect(caught?.code).toBe('missing_context');
    const expected = caught?.details?.['expected'] as Record<string, { type: string }>;
    expect(Object.keys(expected).sort()).toEqual(['deal_id', 'due_date', 'id', 'title']);
    expect(expected['due_date']!.type).toBe('date');
    expect(calls).toHaveLength(0);
  });
});

// ─── Upsert desugar ─────────────────────────────────────────────

describe('upsert desugar', () => {
  it('inserts when the key is absent/empty (insert-only columns included)', async () => {
    const { client, calls } = fakeClient();
    await executeMutation(client, upsertTask, {
      context: { id: '', title: 'T', due_date: null, deal_id: 'deal_9' },
      scope: { userId: 'usr_1' },
      policy,
      schema,
    });
    expect(calls[0]!.sql).toMatch(/^INSERT INTO tasks/);
    expect(calls[0]!.sql).toContain('deal_id');
  });

  it('updates when the key is present (insert-only columns excluded)', async () => {
    const { client, calls } = fakeClient();
    await executeMutation(client, upsertTask, {
      context: { id: 'task_1', title: 'T', due_date: null },
      scope: { userId: 'usr_1' },
      policy,
      schema,
    });
    expect(calls[0]!.sql).toMatch(/^UPDATE tasks SET/);
    expect(calls[0]!.sql).not.toContain('deal_id');
  });
});

// ─── Batches ────────────────────────────────────────────────────

describe('batches', () => {
  const batch = [
    { op: 'insert' as const, table: 'companies', values: { name: { $context: 'a' } } },
    { op: 'insert' as const, table: 'companies', values: { name: { $context: 'b' } } },
  ];

  it('runs a batch inside a transaction', async () => {
    const { client, calls, wasTx } = fakeClient({ transactional: true });
    const rows = await executeMutation(client, batch, { context: { a: 'A', b: 'B' }, scope: { userId: 'u' }, policy, schema });
    expect(wasTx()).toBe(true);
    expect(calls).toHaveLength(2);
    expect(rows).toHaveLength(2);
  });

  it('refuses a batch on a non-transactional client', async () => {
    const { client } = fakeClient();
    await expect(executeMutation(client, batch, { context: { a: 'A', b: 'B' }, scope: { userId: 'u' }, policy, schema })).rejects.toThrow(
      /transactional/,
    );
  });

  it('a single write needs no transaction', async () => {
    const { client, wasTx } = fakeClient({ transactional: true });
    await executeMutation(client, { op: 'insert', table: 'companies', values: { name: 'X' } }, { context: {}, scope: { userId: 'u' }, policy, schema });
    expect(wasTx()).toBe(false);
  });
});
