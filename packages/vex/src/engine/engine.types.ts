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
  // Paired by position with `toColumns`.
  fromColumns: string[];
  toAlias: string;
  toColumns: string[];
  toTable: string;
  kind: 'inner' | 'left';
  // Scope's row rules for a LEFT join go in ON, not WHERE: there a null-padded
  // row would fail the rule and take its driving row with it.
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

export type ResolvedExists = {
  sources: ResolvedSource[];
  joins: ResolvedJoin[];
  filter?: ResolvedFilter;
  aliasMap: Map<string, string>;
};

export type ResolvedQuery = {
  sources: ResolvedSource[];
  joins: ResolvedJoin[];
  // Keyed by the filter's `exists` node itself.
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
