import type { DatabaseSchema } from '../schemas/database.schema.js';
import type { ResolvedQuery } from '../engine/engine.types.js';

export type CompiledQuery = {
  sql: string;
  paramSlots: ParamSlot[];
  contextContract: ContextContract;
};

export type ParamSlot = {
  key: string;
  kind: 'context' | 'scope' | 'semantic';
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'json';
  dimensions?: number;
  // The value goes into a json/jsonb column and binds as its JSON text. Left to
  // a driver, a JS array becomes a Postgres ARRAY literal: `[]` arrives as '{}',
  // which jsonb reads as an object. PGlite does not do this and cannot show it.
  encode?: 'json';
};

export type ContextContract = Record<
  string,
  { type: ParamSlot['type']; kind: ParamSlot['kind'] }
>;

export type BoundParams = unknown[];

export type Row = Record<string, unknown>;

export type IntrospectOptions = {
  entities?: string[];
  exclude?: string[];
  schema?: string;
};

export type DatabaseAdapter = {
  id: string;
  introspect: (options?: IntrospectOptions) => Promise<DatabaseSchema>;
  compile: (resolved: ResolvedQuery) => CompiledQuery;
  execute: (query: CompiledQuery, params: BoundParams) => Promise<Row[]>;
  capabilities: AdapterCapabilities;
  // `ms` of 0 leaves reads unbounded.
  limitReads?: (ms: number) => Promise<'connection' | 'statement' | 'unenforced'>;
};

export type AdapterCapabilities = {
  vectorSearch: boolean;
  fuzzyMatch: boolean;
  jsonFields: boolean;
  fullTextSearch: boolean;
  returningClause: boolean;
  cte: boolean;
  windowFunctions: boolean;
  statementTimeout: boolean;
};
