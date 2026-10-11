import { createMemoryCache, createQueryEngine, seedCache } from '@niscorp/vex';
import type { DatabaseAdapter, DatabaseSchema, MutationClient, QueryEngine, SeedEntry, SeedMutation } from '@niscorp/vex';

// A VEX ENGINE WITH NO DATABASE BEHIND IT, for the tests of ../src/data that
// are about what moss hands vex and what it hears back: the schema is written
// here, a read answers the rows it is given, and a write is recorded and
// answered with one row.

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
// The same read, as an entry that demands a reach of whoever replays it.
export const READ_OWN_NOTES: SeedEntry = { ...READ_NOTES, fingerprint: 'notes/mine', reach: 'personal' };
export const ADD_NOTE: SeedMutation = { fingerprint: 'notes/add', mutation: { op: 'insert', table: 'notes', values: { body: { $context: 'body' } } } };

export type EngineDouble = {
  engine: QueryEngine;
  // What the engine reads through.
  adapter: DatabaseAdapter;
  // The client writes are replayed on: it runs nothing, and remembers the SQL
  // and the parameters of each statement it was handed.
  db: MutationClient;
  written: { sql: string; params: readonly unknown[] }[];
  // What the adapter was asked to run for a read: the bound parameters.
  read: (readonly unknown[])[];
  // Every table a read named, in the order the reads were compiled: whoever
  // made the read, an app's entry or a feature's own.
  tablesRead: string[];
};

// One more table for the schema of a double: a key, and nothing else.
export const tableNamed = (name: string): DatabaseSchema['entities'][number] => ({
  name,
  table: name,
  fields: [{ name: 'id', type: 'text', normalizedType: 'string', nullable: false, primaryKey: true }],
  relations: [],
  indexes: [{ name: `${name}_pkey`, fields: ['id'], unique: true, type: 'btree' }],
});

export const engineDouble = async (rows: Record<string, unknown>[] = [{ id: 1, body: 'first' }], schema: DatabaseSchema = NOTES_SCHEMA): Promise<EngineDouble> => {
  const read: (readonly unknown[])[] = [];
  const tablesRead: string[] = [];
  const written: EngineDouble['written'] = [];
  const adapter: DatabaseAdapter = {
    id: 'double',
    introspect: async () => schema,
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
  const engine = createQueryEngine({ adapter, cache });
  await engine.introspect();
  const db: MutationClient = {
    query: async (sql, params) => {
      written.push({ sql, params: params ?? [] });
      return { rows: [{ id: 7, body: 'written' }] };
    },
  };
  return { engine, adapter, db, written, read, tablesRead };
};
