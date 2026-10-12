import { z } from 'zod';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import { defineTool } from '@niscorp/cortex';
import { QuerySchema } from '../schemas/query.schema.js';
import type { Query } from '../schemas/query.schema.js';
import type { Row } from '../adapters/adapter.types.js';
import type { DatabaseSchema, EntitySchema, FieldSchema } from '../schemas/database.schema.js';
import type { GenerationCaller } from '../types.js';

// No adapter and no policy: the tools read data only through `read`, the
// engine's pipeline run as the caller, so the model sees nothing that caller
// could not have read.
export type QueryToolDeps = {
  getSchema: () => DatabaseSchema | undefined;
  read: GenerationCaller['read'];
};

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

// The query itself at the root, no wrapper: models pass the query object
// directly, and Groq validates tool arguments server-side.
// Every top-level key and nothing below: a model takes the parameter schema as
// the whole contract and writes only the keys it names, and Groq refuses the
// full recursive schema (400). QuerySchema's safeParse is the real validation.
const inSpec = (what: string): string => `${what} — written as the DSL spec (OUTPUT SCHEMA) says.`;
const TestQueryInputSchema = z
  .object({
    from: z.array(z.unknown()).describe(inSpec('The data sources: entity names (or subqueries); every entity the query uses is listed here')),
    fields: z.array(z.unknown()).optional().describe(inSpec('Raw columns to select, `entity.field` or `{ field, as }`; omit for an aggregate-only query')),
    filter: z.record(z.string(), z.unknown()).optional().describe(inSpec('Filter conditions')),
    compute: z.record(z.string(), z.unknown()).optional().describe(inSpec('Computed fields: output alias → expression')),
    aggregate: z.record(z.string(), z.unknown()).optional().describe(inSpec('Aggregates (count, sum, avg, …): output alias → function')),
    groupBy: z.array(z.unknown()).optional().describe(inSpec('Fields to group by, for aggregates')),
    sort: z.array(z.unknown()).optional().describe(inSpec('Sort order')),
    limit: z.number().optional().describe('Maximum rows to return.'),
    distinct: z.boolean().optional().describe('Eliminate duplicate rows.'),
  })
  .catchall(z.unknown())
  .describe('Your draft DSL query — the query object itself, NOT wrapped in any field.');
export type TestQueryInput = z.infer<typeof TestQueryInputSchema>;

const CannotSatisfyInputSchema = z.object({
  reason: z.string().describe('Why the request cannot be satisfied'),
});
export type CannotSatisfyInput = z.infer<typeof CannotSatisfyInputSchema>;

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
  next?: string;
};

const NEXT_AFTER_PASS =
  'This query runs. If its rows answer the request, you are done: do not test it again — finish now with the envelope, its `data` being exactly this query. If not, change the query and test again.';

type Located = { entity: EntitySchema } | { error: string };
type LocatedField = { entity: EntitySchema; field: FieldSchema } | { error: string };

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

const attempt = async <T>(run: () => Promise<T>): Promise<T | { error: string }> => {
  try {
    return await run();
  } catch (err) {
    return { error: messageOf(err) };
  }
};

const firstRow = (rows: Row[]): Row => rows[0] ?? {};

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
      if (exceedsDepth(input)) return { rows: [], sql: '', warnings: [], errors: [depthRefusal()] };
      const parseResult = QuerySchema.safeParse(input);
      if (!parseResult.success) {
        const validationErrors = parseResult.error.issues.map(
          issue => `${issue.path.join('.')}: ${issue.message}`,
        );
        return { rows: [], sql: '', warnings: [], errors: validationErrors };
      }

      try {
        const { rows, sql, warnings } = await deps.read({ ...parseResult.data, limit: 5 });
        return { rows, sql, warnings, errors: [], next: NEXT_AFTER_PASS };
      } catch (err: unknown) {
        return { rows: [], sql: '', warnings: [], errors: [messageOf(err)] };
      }
    },
  });

  // createQueryDsl watches the run's event stream for this tool's id and aborts the run.
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
