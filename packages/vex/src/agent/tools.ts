import { z } from 'zod';
import { defineTool } from '@niscorp/cortex';
import { QuerySchema } from '../schemas/query.schema.js';
import type { Query } from '../schemas/query.schema.js';
import type { Row } from '../adapters/adapter.types.js';
import type { DatabaseSchema, EntitySchema, FieldSchema } from '../schemas/database.schema.js';
import type { GenerationCaller } from '../types.js';

// ═══════════════════════════════════════════════════════════════
// Dependencies
//
// The tools hold no adapter and no policy. Everything they learn about the
// data they learn through `read` — the engine's own pipeline, run as the
// caller the generation is for — so a sample row, a distinct value and a
// null count are all things that person could have read, and nothing else.
// There is no SQL in this file.
// ═══════════════════════════════════════════════════════════════

export type QueryToolDeps = {
  getSchema: () => DatabaseSchema | undefined;
  read: GenerationCaller['read'];
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
  limit: z.number().int().positive().max(50).optional().describe('Max rows to return (default: 5)'),
});
export type GetSampleRowsInput = z.infer<typeof GetSampleRowsInputSchema>;

const GetDistinctValuesInputSchema = z.object({
  entity: z.string().describe('Entity name'),
  field: z.string().describe('Field name within the entity'),
  limit: z.number().int().positive().max(200).optional().describe('Max distinct values to return (default: 20)'),
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

type Located = { entity: EntitySchema } | { error: string };
type LocatedField = { entity: EntitySchema; field: FieldSchema } | { error: string };

// The schema the tools are handed is already the caller's — tables their
// policy cannot read are not in it — so "not found" and "not yours" are the
// same answer, which is the point.
const locate = (deps: QueryToolDeps, entityName: string): Located => {
  const schema = deps.getSchema();
  if (schema === undefined) return { error: 'Schema not available' };
  const entity = schema.entities.find((e) => e.name === entityName);
  return entity === undefined ? { error: `Entity "${entityName}" not found` } : { entity };
};

const locateField = (deps: QueryToolDeps, entityName: string, fieldName: string): LocatedField => {
  const located = locate(deps, entityName);
  if ('error' in located) return located;
  const field = located.entity.fields.find((f) => f.name === fieldName);
  return field === undefined
    ? { error: `Field "${fieldName}" not found on entity "${entityName}"` }
    : { entity: located.entity, field };
};

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// A read that fails (a refused table, a column the grammar cannot name) is an
// answer the model can use, not a crash of the run.
const attempt = async <T>(run: () => Promise<T>): Promise<T | { error: string }> => {
  try {
    return await run();
  } catch (err) {
    return { error: messageOf(err) };
  }
};

const firstRow = (rows: Row[]): Row => rows[0] ?? {};

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
      const located = locate(deps, input.entity);
      if ('error' in located) return located;
      const { entity } = located;
      // Vector columns are left out: hundreds of floats per row teach the
      // model nothing and cost the context window everything.
      const fields = entity.fields.filter((f) => f.normalizedType !== 'vector').map((f) => `${entity.name}.${f.name}`);
      const query: Query = { from: [entity.name], fields, limit: input.limit ?? 5 };
      return attempt(async () => (await deps.read(query)).rows);
    },
  });

  const getDistinctValuesTool = defineTool({
    id: 'getDistinctValues',
    name: 'getDistinctValues',
    description: 'Returns distinct values for a specific field in an entity.',
    input: GetDistinctValuesInputSchema,
    execute: async (input: GetDistinctValuesInput) => {
      const located = locateField(deps, input.entity, input.field);
      if ('error' in located) return located;
      const { entity, field } = located;
      const query: Query = { from: [entity.name], fields: [`${entity.name}.${field.name}`], distinct: true, limit: input.limit ?? 20 };
      return attempt(async () => (await deps.read(query)).rows.map((row) => row[field.name]));
    },
  });

  const describeFieldTool = defineTool({
    id: 'describeField',
    name: 'describeField',
    description: 'Returns statistics about a field: type, nullable, cardinality, null count, min/max for numeric/date types.',
    input: DescribeFieldInputSchema,
    execute: async (input: DescribeFieldInput) => {
      const located = locateField(deps, input.entity, input.field);
      if ('error' in located) return located;
      const { entity, field } = located;
      const path = `${entity.name}.${field.name}`;
      const isNumericOrDate = ['number', 'date', 'timestamp'].includes(field.normalizedType);

      return attempt(async (): Promise<FieldStats> => {
        const [counted, nulls, range] = await Promise.all([
          deps.read({ from: [entity.name], aggregate: { cardinality: { countDistinct: path } } }),
          deps.read({ from: [entity.name], aggregate: { null_count: { count: '*' } }, filter: { isNull: path } }),
          isNumericOrDate
            ? deps.read({ from: [entity.name], aggregate: { min_val: { min: path }, max_val: { max: path } } })
            : Promise.resolve(undefined),
        ]);

        const stats: FieldStats = {
          type: field.normalizedType,
          nullable: field.nullable,
          cardinality: Number(firstRow(counted.rows)['cardinality'] ?? 0),
          nullCount: Number(firstRow(nulls.rows)['null_count'] ?? 0),
        };
        if (range !== undefined) {
          stats.min = firstRow(range.rows)['min_val'];
          stats.max = firstRow(range.rows)['max_val'];
        }
        return stats;
      });
    },
  });

  const testQueryTool = defineTool({
    id: 'testQuery',
    name: 'testQuery',
    description:
      'Validates a DSL query, compiles it to SQL, and executes it with synthetic parameters (LIMIT 5). ' +
      'Pass the query object DIRECTLY as the arguments. Returns rows, SQL, warnings, and errors.',
    input: TestQueryInputSchema,
    execute: async (input: TestQueryInput): Promise<TestQueryResult> => {
      const parseResult = QuerySchema.safeParse(input);
      if (!parseResult.success) {
        const validationErrors = parseResult.error.issues.map(
          issue => `${issue.path.join('.')}: ${issue.message}`,
        );
        return { rows: [], sql: '', warnings: [], errors: validationErrors };
      }

      try {
        const { rows, sql, warnings } = await deps.read({ ...parseResult.data, limit: 5 });
        return { rows, sql, warnings, errors: [] };
      } catch (err: unknown) {
        return { rows: [], sql: '', warnings: [], errors: [messageOf(err)] };
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
