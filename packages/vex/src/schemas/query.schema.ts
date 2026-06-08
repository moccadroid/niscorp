import { z } from 'zod';
import { FilterSchema } from './filter.schema.js';
import { ComputeExpressionSchema } from './compute.schema.js';
import { AggregateExpressionSchema } from './aggregate.schema.js';
import type { Filter } from './filter.schema.js';
import type { ComputeExpression } from './compute.schema.js';
import type { AggregateExpression } from './aggregate.schema.js';

export const SortEntrySchema = z
  .object({
    field: z.string().describe('Field path (entity.field), computed field name, or aggregate alias'),
    dir: z.enum(['asc', 'desc']).default('asc').describe('Sort direction'),
  })
  .strict()
  .describe('Sort specification');

export type SortEntry = z.infer<typeof SortEntrySchema>;

export type Source = string | { as: string; query: Query };

export type Query = {
  from: Source[];
  fields: string[];
  filter?: Filter;
  compute?: Record<string, ComputeExpression>;
  aggregate?: Record<string, AggregateExpression>;
  groupBy?: string[];
  sort?: SortEntry[];
  limit?: number;
  distinct?: boolean;
};

const SubquerySourceSchema = z
  .object({
    as: z.string().describe('Alias for subquery results — use as prefix in field paths'),
    query: z.lazy((): z.ZodType<Query> => QuerySchema).describe('A nested query'),
  })
  .strict()
  .describe('Subquery data source');

const SourceSchema = z
  .union([
    z.string().describe('Entity name from the database schema'),
    SubquerySourceSchema,
  ])
  .describe('Data source: entity name or subquery');

export const QuerySchema: z.ZodType<Query> = z.lazy(() =>
  z
    .object({
      from: z.array(SourceSchema).min(1).describe('Data sources — entity names or subqueries. Every entity used anywhere in the query must be listed here.'),
      fields: z.array(z.string()).min(1).describe('Raw columns to select, each in entity.field format (no SELECT *). Do not list compute or aggregate aliases here — those are added to the output automatically.'),
      filter: FilterSchema.optional().describe('Filter conditions'),
      compute: z.record(z.string(), ComputeExpressionSchema).optional().describe('Computed fields — key is output alias, value is the expression'),
      aggregate: z.record(z.string(), AggregateExpressionSchema).optional().describe('Aggregate functions — key is output alias, value is the function'),
      groupBy: z.array(z.string()).optional().describe('Fields to group by for aggregation'),
      sort: z.array(SortEntrySchema).optional().describe('Sort order'),
      limit: z.number().int().positive().optional().describe('Maximum rows to return'),
      distinct: z.boolean().optional().describe('Eliminate duplicate rows'),
    })
    .strict(),
);

export { SubquerySourceSchema, SourceSchema };
