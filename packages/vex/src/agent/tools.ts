import { z } from 'zod';
import { defineTool } from '@niscorp/cortex';
import { QuerySchema } from '../schemas/query.schema.js';
import { discoverEntities } from '../scope/discover.js';
import { applyScope } from '../scope/apply.js';
import { resolve } from '../engine/resolver.js';
import { analyze } from '../engine/analyzer.js';
import type { Query } from '../schemas/query.schema.js';
import type { DatabaseAdapter, CompiledQuery, BoundParams, Row } from '../adapters/adapter.types.js';
import type { DatabaseSchema, EntitySchema } from '../schemas/database.schema.js';
import type { ScopePolicy } from '../scope/scope.types.js';
import type { AnalysisConfig } from '../engine/engine.types.js';

// ═══════════════════════════════════════════════════════════════
// Dependencies
// ═══════════════════════════════════════════════════════════════

export type QueryToolDeps = {
  getSchema: () => DatabaseSchema | undefined;
  adapter: DatabaseAdapter;
  scopePolicy?: ScopePolicy;
};

// ═══════════════════════════════════════════════════════════════
// Tool input schemas + types
// ═══════════════════════════════════════════════════════════════

const GetSchemaInputSchema = z.object({
  entities: z.array(z.string()).optional().describe('Filter to specific entity names'),
});
export type GetSchemaInput = z.infer<typeof GetSchemaInputSchema>;

const GetSampleRowsInputSchema = z.object({
  entity: z.string().describe('Entity name to sample rows from'),
  limit: z.number().int().positive().optional().describe('Max rows to return (default: 5)'),
});
export type GetSampleRowsInput = z.infer<typeof GetSampleRowsInputSchema>;

const GetDistinctValuesInputSchema = z.object({
  entity: z.string().describe('Entity name'),
  field: z.string().describe('Field name within the entity'),
  limit: z.number().int().positive().optional().describe('Max distinct values to return (default: 20)'),
});
export type GetDistinctValuesInput = z.infer<typeof GetDistinctValuesInputSchema>;

const DescribeFieldInputSchema = z.object({
  entity: z.string().describe('Entity name'),
  field: z.string().describe('Field name within the entity'),
});
export type DescribeFieldInput = z.infer<typeof DescribeFieldInputSchema>;

// The draft query ITSELF at the root — no `dsl` wrapper. Models
// naturally pass the query object directly, and a wrapper mismatch is
// fatal on providers (Groq) that validate tool args SERVER-SIDE.
// Deliberately permissive on the wire: the real validation is this
// tool's own QuerySchema.safeParse, which returns errors the model can
// read and fix — that feedback loop is the tool's entire purpose.
const TestQueryInputSchema = z
  .record(z.string(), z.unknown())
  .describe('Your draft DSL query — the query object itself (from/fields/…), NOT wrapped in any field.');
export type TestQueryInput = z.infer<typeof TestQueryInputSchema>;

const CannotSatisfyInputSchema = z.object({
  reason: z.string().describe('Why the request cannot be satisfied'),
});
export type CannotSatisfyInput = z.infer<typeof CannotSatisfyInputSchema>;

// ═══════════════════════════════════════════════════════════════
// Result types
// ═══════════════════════════════════════════════════════════════

type FieldStats = {
  type: string;
  nullable: boolean;
  cardinality: number;
  nullCount: number;
  min?: unknown;
  max?: unknown;
};

type TestQueryResult = {
  rows: Row[];
  sql: string;
  warnings: string[];
  errors: string[];
};

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

const findEntity = (schema: DatabaseSchema, entityName: string): EntitySchema | undefined =>
  schema.entities.find(e => e.name === entityName);

const buildSimpleQuery = (sql: string): CompiledQuery => ({
  sql,
  paramSlots: [],
  contextContract: {},
});

const executeRaw = (adapter: DatabaseAdapter, sql: string): Promise<Row[]> =>
  adapter.execute(buildSimpleQuery(sql), []);

// Synthetic params bind NULL: comparisons against a column of ANY type are
// valid SQL with NULL (Postgres infers the type from the column side), so
// testQuery checks executability without guessing values. Typed guesses
// were a trap — '' bound against a date/uuid column is a cast ERROR, which
// made the agent conclude the DSL "does not support" date-context
// comparisons and negative-cache a perfectly satisfiable request.
export const buildSyntheticParams = (compiled: CompiledQuery): BoundParams =>
  compiled.paramSlots.map(() => null);

const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  maxNestingDepth: 2,
  rejectCartesianProducts: true,
  warnUnindexedFilters: true,
  rejectUnindexedFilters: false,
};

// ═══════════════════════════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════════════════════════

export const createQueryTools = (deps: QueryToolDeps): ReturnType<typeof defineTool>[] => {
  const getSchemaTool = defineTool({
    id: 'getSchema',
    name: 'getSchema',
    description: 'Returns the introspected database schema, optionally filtered to specific entities.',
    input: GetSchemaInputSchema,
    execute: (input: GetSchemaInput) => {
      const schema = deps.getSchema();
      if (!schema) return { error: 'Schema not available' };

      if (input.entities && input.entities.length > 0) {
        const filtered = {
          ...schema,
          entities: schema.entities.filter(e => input.entities?.includes(e.name)),
        };
        return JSON.stringify(filtered);
      }

      return JSON.stringify(schema);
    },
  });

  const getSampleRowsTool = defineTool({
    id: 'getSampleRows',
    name: 'getSampleRows',
    description: 'Returns sample rows from an entity table.',
    input: GetSampleRowsInputSchema,
    execute: async (input: GetSampleRowsInput) => {
      const schema = deps.getSchema();
      if (!schema) return { error: 'Schema not available' };

      const entity = findEntity(schema, input.entity);
      if (!entity) return { error: `Entity "${input.entity}" not found` };

      const rowLimit = input.limit ?? 5;
      const sql = `SELECT * FROM ${entity.table} LIMIT ${rowLimit}`;
      const rows = await executeRaw(deps.adapter, sql);
      return rows;
    },
  });

  const getDistinctValuesTool = defineTool({
    id: 'getDistinctValues',
    name: 'getDistinctValues',
    description: 'Returns distinct values for a specific field in an entity.',
    input: GetDistinctValuesInputSchema,
    execute: async (input: GetDistinctValuesInput) => {
      const schema = deps.getSchema();
      if (!schema) return { error: 'Schema not available' };

      const entity = findEntity(schema, input.entity);
      if (!entity) return { error: `Entity "${input.entity}" not found` };

      const field = entity.fields.find(f => f.name === input.field);
      if (!field) return { error: `Field "${input.field}" not found on entity "${input.entity}"` };

      const valueLimit = input.limit ?? 20;
      const sql = `SELECT DISTINCT ${field.name} FROM ${entity.table} LIMIT ${valueLimit}`;
      const rows = await executeRaw(deps.adapter, sql);
      return rows.map(row => row[field.name]);
    },
  });

  const describeFieldTool = defineTool({
    id: 'describeField',
    name: 'describeField',
    description: 'Returns statistics about a field: type, nullable, cardinality, null count, min/max for numeric/date types.',
    input: DescribeFieldInputSchema,
    execute: async (input: DescribeFieldInput) => {
      const schema = deps.getSchema();
      if (!schema) return { error: 'Schema not available' };

      const entity = findEntity(schema, input.entity);
      if (!entity) return { error: `Entity "${input.entity}" not found` };

      const field = entity.fields.find(f => f.name === input.field);
      if (!field) return { error: `Field "${input.field}" not found on entity "${input.entity}"` };

      const isNumericOrDate = ['number', 'date', 'timestamp'].includes(field.normalizedType);

      const cardinalitySql = `SELECT COUNT(DISTINCT ${field.name}) AS cardinality FROM ${entity.table}`;
      const nullCountSql = `SELECT COUNT(*) AS null_count FROM ${entity.table} WHERE ${field.name} IS NULL`;

      const [cardinalityRows, nullCountRows] = await Promise.all([
        executeRaw(deps.adapter, cardinalitySql),
        executeRaw(deps.adapter, nullCountSql),
      ]);

      const firstCardinality = cardinalityRows[0];
      const firstNullCount = nullCountRows[0];

      const stats: FieldStats = {
        type: field.normalizedType,
        nullable: field.nullable,
        cardinality: Number(firstCardinality?.cardinality ?? 0),
        nullCount: Number(firstNullCount?.null_count ?? 0),
      };

      if (isNumericOrDate) {
        const minMaxSql = `SELECT MIN(${field.name}) AS min_val, MAX(${field.name}) AS max_val FROM ${entity.table}`;
        const minMaxRows = await executeRaw(deps.adapter, minMaxSql);
        const firstMinMax = minMaxRows[0];
        if (firstMinMax) {
          stats.min = firstMinMax.min_val;
          stats.max = firstMinMax.max_val;
        }
      }

      return stats;
    },
  });

  const testQueryTool = defineTool({
    id: 'testQuery',
    name: 'testQuery',
    description:
      'Validates a DSL query, compiles it to SQL, and executes it with synthetic parameters (LIMIT 5, statement timeout). ' +
      'Pass the query object DIRECTLY as the arguments. Returns rows, SQL, warnings, and errors.',
    input: TestQueryInputSchema,
    execute: async (input: TestQueryInput): Promise<TestQueryResult> => {
      const schema = deps.getSchema();
      if (!schema) return { rows: [], sql: '', warnings: [], errors: ['Schema not available'] };

      const parseResult = QuerySchema.safeParse(input);
      if (!parseResult.success) {
        const validationErrors = parseResult.error.issues.map(
          issue => `${issue.path.join('.')}: ${issue.message}`,
        );
        return { rows: [], sql: '', warnings: [], errors: validationErrors };
      }

      const dsl = parseResult.data;

      try {
        const entities = discoverEntities(dsl);

        const scopedDsl = deps.scopePolicy
          ? applyScope(dsl, entities, deps.scopePolicy)
          : dsl;

        const testDsl: Query = { ...scopedDsl, limit: 5 };
        const resolved = resolve(testDsl, schema);
        const analysis = analyze(resolved, DEFAULT_ANALYSIS_CONFIG);

        if (analysis.errors.length > 0) {
          return { rows: [], sql: '', warnings: analysis.warnings, errors: analysis.errors };
        }

        const compiled = deps.adapter.compile(resolved);

        const hasSemantic = compiled.paramSlots.some(s => s.kind === 'semantic');
        if (hasSemantic) {
          return {
            rows: [],
            sql: compiled.sql,
            warnings: [...analysis.warnings, 'Semantic params present — execution skipped, SQL structure validated only'],
            errors: [],
          };
        }

        const syntheticParams = buildSyntheticParams(compiled);
        const rows = await deps.adapter.execute(compiled, syntheticParams);

        return {
          rows,
          sql: compiled.sql,
          warnings: analysis.warnings,
          errors: [],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { rows: [], sql: '', warnings: [], errors: [message] };
      }
    },
  });

  // The caller (createQueryDsl) watches for this tool's observation on
  // the run's event stream and aborts the run with the reason — the
  // v2 replacement for the v1 bus-emit + abort-rule pair.
  const cannotSatisfyTool = defineTool({
    id: 'cannotSatisfy',
    name: 'cannotSatisfy',
    description: 'Signal that the natural language request cannot be satisfied by the available schema. This ends the run.',
    input: CannotSatisfyInputSchema,
    execute: (input: CannotSatisfyInput) => ({ acknowledged: true, reason: input.reason }),
  });

  return [
    getSchemaTool,
    getSampleRowsTool,
    getDistinctValuesTool,
    describeFieldTool,
    testQueryTool,
    cannotSatisfyTool,
  ];
};
