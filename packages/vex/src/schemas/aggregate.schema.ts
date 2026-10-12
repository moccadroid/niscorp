import { z } from 'zod';
import { ComputeExpressionSchema } from './compute.schema.js';
import { FieldPathSchema } from './identifier.schema.js';

const fieldPath = FieldPathSchema.describe('Field path in entity.field format');

const fieldOrExpr = z.union([fieldPath, ComputeExpressionSchema]).describe('A field path or a compute expression');

export const AggregateExpressionSchema = z
  .union([
    z.object({ count: z.union([FieldPathSchema, z.literal('*')]).describe('Field path or "*" for COUNT(*)') }).strict().describe('COUNT'),
    z.object({ countDistinct: FieldPathSchema.describe('Field path whose distinct non-null values are counted') }).strict().describe('COUNT(DISTINCT field)'),
    z.object({ sum: fieldOrExpr }).strict().describe('SUM'),
    z.object({ avg: fieldOrExpr }).strict().describe('AVG'),
    z.object({ min: fieldOrExpr }).strict().describe('MIN'),
    z.object({ max: fieldOrExpr }).strict().describe('MAX'),
  ])
  .describe('Aggregate function applied to a field or expression');

export type AggregateExpression = z.infer<typeof AggregateExpressionSchema>;
