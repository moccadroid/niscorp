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
  // `json` binds as a JSON string (insertEach items) — the mutation engine
  // stringifies it so drivers don't turn a JS array into an ARRAY literal.
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'json';
  dimensions?: number;
};

export type ContextContract = Record<
  string,
  { type: ParamSlot['type']; kind: ParamSlot['kind'] }
>;

export type BoundParams = unknown[];

export type Row = Record<string, unknown>;

export type IntrospectOptions = {
  // Only these tables. An allow-list, so a host that knows its surface can
  // name it exactly.
  entities?: string[];
  // Everything BUT these. The shape a host wants when it does not author a
  // table list on principle but does own some tables that are not
  // application data — an engine's own bookkeeping, a migration journal.
  // Without it those tables introspect into the grantable set and become
  // strings somebody can be granted `.read` on.
  exclude?: string[];
  schema?: string;
};

export type DatabaseAdapter = {
  id: string;
  introspect: (options?: IntrospectOptions) => Promise<DatabaseSchema>;
  compile: (resolved: ResolvedQuery) => CompiledQuery;
  execute: (query: CompiledQuery, params: BoundParams) => Promise<Row[]>;
  capabilities: AdapterCapabilities;
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
