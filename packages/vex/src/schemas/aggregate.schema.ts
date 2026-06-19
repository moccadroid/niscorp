import { z } from 'zod';
import { ComputeExpressionSchema } from './compute.schema.js';

const fieldPath = z.string().describe('Field path in entity.field format');

// SUM/AVG/MIN/MAX take either a field path or a compute expression — so the
// argument can be a derived value (e.g. SUM(value * win_probability / 100)),
// not just a column. A bare string stays valid (non-breaking).
const fieldOrExpr = z.union([fieldPath, ComputeExpressionSchema]).describe('A field path or a compute expression');

export const AggregateExpressionSchema = z
  .union([
    z.object({ count: z.string().describe('Field path or "*" for COUNT(*)') }).strict().describe('COUNT'),
    z.object({ sum: fieldOrExpr }).strict().describe('SUM'),
    z.object({ avg: fieldOrExpr }).strict().describe('AVG'),
    z.object({ min: fieldOrExpr }).strict().describe('MIN'),
    z.object({ max: fieldOrExpr }).strict().describe('MAX'),
  ])
  .describe('Aggregate function applied to a field or expression');

export type AggregateExpression = z.infer<typeof AggregateExpressionSchema>;
