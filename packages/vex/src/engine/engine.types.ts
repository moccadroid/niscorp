import type { EntitySchema, FieldSchema } from '../schemas/database.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { ComputeExpression } from '../schemas/compute.schema.js';
import type { AggregateExpression } from '../schemas/aggregate.schema.js';

export type ResolvedSource = {
  alias: string;
  entity?: EntitySchema;
  subquery?: ResolvedQuery;
  table?: string;
};

export type ResolvedField = {
  path: string;
  alias: string;
  column: string;
  outputName: string;
  schema: FieldSchema;
};

export type ResolvedJoin = {
  fromAlias: string;
  fromColumn: string;
  toAlias: string;
  toColumn: string;
  toTable: string;
  // 'left' when the referencing FK column is nullable: a null FK must never
  // drop the referencing row from the read. Non-nullable FKs compile to an
  // inner JOIN (equivalent — the column can't be null).
  kind: 'inner' | 'left';
  // Predicates that belong in this join's ON clause rather than in WHERE.
  //
  // Scope puts its row rules here for LEFT joins, and the distinction is not
  // cosmetic: `LEFT JOIN rooms ON ... WHERE rooms.tenant = $1` is an INNER join
  // wearing a LEFT keyword, because a null-padded row fails the WHERE and takes
  // its driving row with it. The same predicate in ON filters which rows may
  // join without ever dropping the row that had none.
  on?: ResolvedFilter[];
};

export type ResolvedFilter = {
  original: Filter;
  resolvedPaths: Map<string, { alias: string; column: string; schema: FieldSchema }>;
};

export type ResolvedSemantic = {
  field: ResolvedField;
  contextPath: string;
  minScore?: number;
};

// An EXISTS, resolved. It carries its own sources, joins and alias map, and its
// filter may reference OUTER aliases — that is the correlation, and it is why
// the inner alias map is layered over the outer one at compile time rather than
// replacing it.
export type ResolvedExists = {
  sources: ResolvedSource[];
  joins: ResolvedJoin[];
  filter?: ResolvedFilter;
  aliasMap: Map<string, string>;
};

export type ResolvedQuery = {
  sources: ResolvedSource[];
  joins: ResolvedJoin[];
  // Keyed by the `exists` node itself, so the compiler can find the resolution
  // for the node it is looking at while walking the raw filter tree.
  existsMap?: Map<object, ResolvedExists>;
  fields: ResolvedField[];
  filter?: ResolvedFilter;
  semantic?: ResolvedSemantic;
  computes: Array<{ name: string; expression: ComputeExpression }>;
  aggregates: Array<{ name: string; expression: AggregateExpression }>;
  groupBy: ResolvedField[];
  sort: Array<{ field: ResolvedField | string; dir: 'asc' | 'desc' }>;
  limit?: number;
  distinct: boolean;
  aliasMap: Map<string, string>;
};

export type AnalysisResult = {
  warnings: string[];
  errors: string[];
};

export type AnalysisConfig = {
  maxNestingDepth: number;
  rejectCartesianProducts: boolean;
  warnUnindexedFilters: boolean;
  rejectUnindexedFilters: boolean;
};

export type TestResult = {
  rows: Record<string, unknown>[];
  warnings: string[];
  errors: string[];
};
