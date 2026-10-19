import { describe, it, expect } from 'vitest';
import type { SignalClient } from '@niscorp/cortex';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { compactSchema, compactSpec } from '../../src/agent/compact.js';
import { storedShape } from '../../src/agent/declared.js';
import { createQueryDsl } from '../../src/agent/index.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';

const dslSchema = createQueryEngine({ adapter: createPostgresAdapter({ pool: { query: () => Promise.reject(new Error('unused')) } }) }).getDslSchema();

const collect = (value: unknown, pick: (record: Record<string, unknown>) => string[]): string[] => {
  if (Array.isArray(value)) return value.flatMap((one) => collect(one, pick));
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [...pick(record), ...Object.values(record).flatMap((inner) => collect(inner, pick))];
};

const schema: DatabaseSchema = {
  entities: [
    {
      name: 'deals',
      table: 'deals',
      fields: [
        { name: 'id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: true },
        { name: 'company_id', type: 'text', normalizedType: 'string', nullable: true, primaryKey: false },
        { name: 'close_date', type: 'date', normalizedType: 'date', nullable: true, primaryKey: false },
      ],
      relations: [{ type: 'belongsTo', entity: 'companies', localFields: ['company_id'], foreignFields: ['id'] }],
      indexes: [
        { name: 'deals_pkey', fields: ['id'], unique: true, type: 'btree' },
        { name: 'idx_deals_company', fields: ['company_id'], unique: false, type: 'btree' },
      ],
    },
    { name: 'companies', table: 'companies', fields: [{ name: 'id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: true }, { name: 'name', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false }], relations: [], indexes: [] },
  ],
} as unknown as DatabaseSchema;

describe('compactSpec', () => {
  it('keeps every description, property name and allowed value of the DSL schema, in about half the text', () => {
    const spec = compactSpec(dslSchema);
    const descriptions = collect(dslSchema, (record) => (typeof record['description'] === 'string' ? [record['description']] : []));
    const properties = collect(dslSchema, (record) => (record['properties'] !== null && typeof record['properties'] === 'object' ? Object.keys(record['properties'] as object) : []));
    const allowed = collect(dslSchema, (record) => (Array.isArray(record['enum']) ? record['enum'].map((one) => JSON.stringify(one)) : []));
    expect([...descriptions, ...properties, ...allowed].filter((one) => !spec.includes(one))).toEqual([]);
    expect(spec.length).toBeLessThan(JSON.stringify(dslSchema).length * 0.6);
  });
});

describe('compactSchema', () => {
  it('names every entity, field, relation and index that is not the primary key', () => {
    expect(compactSchema(schema)).toBe(
      ['deals: id text key, company_id text null, close_date date null', '  relations: belongsTo companies (company_id = companies.id)', '  indexed: company_id', 'companies: id text key, name text'].join('\n'),
    );
  });
});

describe('storedShape', () => {
  it('asks the query for the stored fields a declared field reads, in place of the declared one', () => {
    expect(storedShape([{ id: '', due_display: { $date: { value: { $ref: '$.due_date' }, format: 'MMM D' } } }])).toEqual({ shape: [{ id: '', due_date: '' }], declared: true });
    expect(storedShape([{ id: '', title: '' }])).toEqual({ shape: [{ id: '', title: '' }], declared: false });
  });
});

describe('createQueryDsl', () => {
  it('gives the agent the schema and the DSL as compact text, and the stored fields a declared shape reads', async () => {
    const asked: string[] = [];
    const recording = (request: unknown): never => {
      asked.push(JSON.stringify(request));
      throw new Error('no answer here');
    };
    const llm = { step: recording, stepStream: recording, count: async () => 1, describe: () => ({ provider: 'stub', model: 'stub', kind: 'chat', modelKnown: false, capabilities: { nativeTools: true, nativeJsonSchema: false, nativeJsonMode: true, toolsWithStructuredOutput: false, validatesToolArgs: false, manglesNestedToolArgs: false, multimodal: false, supportsEmbedding: false } }) } as unknown as SignalClient;
    const write = createQueryDsl({ llm, queryJsonSchema: dslSchema });
    await expect(
      write(
        { intent: 'deals with their close date', shape: [{ id: '', close_display: { $date: { value: { $ref: '$.close_date' }, format: 'MMM D' } } }], context: {} },
        schema,
        { bindings: [], read: async () => [] },
      ),
    ).rejects.toThrow();
    const request = asked[0] ?? '';
    expect(request).toContain('deals: id text key');
    expect(request).not.toContain('normalizedType');
    expect(request).toContain('written as types');
    expect(request).toContain('close_date');
    expect(request).not.toContain('close_display');
  });
});
