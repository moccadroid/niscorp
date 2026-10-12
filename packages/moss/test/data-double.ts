import { createMemoryCache, createQueryEngine, seedCache } from '@niscorp/vex';
import type { DatabaseAdapter, DatabaseSchema, MutationClient, QueryEngine, SeedEntry, SeedMutation } from '@niscorp/vex';

export const NOTES_SCHEMA: DatabaseSchema = {
  entities: [
    {
      name: 'notes',
      table: 'notes',
      fields: [
        { name: 'id', type: 'integer', normalizedType: 'number', nullable: false, primaryKey: true },
        { name: 'body', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
        { name: 'studio_id', type: 'text', normalizedType: 'string', nullable: true, primaryKey: false },
      ],
      relations: [],
      indexes: [{ name: 'notes_pkey', fields: ['id'], unique: true, type: 'btree' }],
    },
    {
      name: 'tags',
      table: 'tags',
      fields: [{ name: 'id', type: 'integer', normalizedType: 'number', nullable: false, primaryKey: true }],
      relations: [],
      indexes: [{ name: 'tags_pkey', fields: ['id'], unique: true, type: 'btree' }],
    },
  ],
};

export const READ_NOTES: SeedEntry = { fingerprint: 'notes/all', dsl: { from: ['notes'], fields: ['notes.id', 'notes.body'] } };
export const READ_OWN_NOTES: SeedEntry = { ...READ_NOTES, fingerprint: 'notes/mine', reach: 'personal' };
export const ADD_NOTE: SeedMutation = { fingerprint: 'notes/add', mutation: { op: 'insert', table: 'notes', values: { body: { $context: 'body' } } } };

export type EngineDouble = {
  engine: QueryEngine;
  adapter: DatabaseAdapter;
  db: MutationClient;
  written: { sql: string; params: readonly unknown[] }[];
  read: (readonly unknown[])[];
  tablesRead: string[];
};

export const tableNamed = (name: string): DatabaseSchema['entities'][number] => ({
  name,
  table: name,
  fields: [{ name: 'id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: true }],
  relations: [],
  indexes: [{ name: `${name}_pkey`, fields: ['id'], unique: true, type: 'btree' }],
});

export const engineDouble = async (rows: Record<string, unknown>[] = [{ id: 1, body: 'first' }], schema: DatabaseSchema = NOTES_SCHEMA, entities?: string[]): Promise<EngineDouble> => {
  const read: (readonly unknown[])[] = [];
  const tablesRead: string[] = [];
  const written: EngineDouble['written'] = [];
  const adapter: DatabaseAdapter = {
    id: 'double',
    introspect: async (options) => {
      const asked = options?.entities;
      return asked === undefined ? schema : { entities: schema.entities.filter((entity) => asked.includes(entity.name)) };
    },
    compile: (resolved) => {
      for (const source of resolved.sources) if (source.entity !== undefined) tablesRead.push(source.entity.table);
      return { sql: 'SELECT 1', paramSlots: [], contextContract: {} };
    },
    execute: async (_query, params) => {
      read.push(params);
      return rows;
    },
    capabilities: {
      vectorSearch: false,
      fuzzyMatch: false,
      jsonFields: false,
      fullTextSearch: false,
      returningClause: true,
      cte: false,
      windowFunctions: false,
      statementTimeout: false,
    },
  };
  const cache = createMemoryCache();
  await seedCache(cache, [READ_NOTES, READ_OWN_NOTES, ADD_NOTE]);
  const engine = createQueryEngine({ adapter, cache, ...(entities !== undefined ? { config: { entities } } : {}) });
  await engine.introspect();
  const db: MutationClient = {
    query: async (sql, params) => {
      written.push({ sql, params: params ?? [] });
      return { rows: [{ id: 7, body: 'written' }] };
    },
  };
  return { engine, adapter, db, written, read, tablesRead };
};
