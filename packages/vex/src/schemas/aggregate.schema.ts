import { z } from 'zod';

const fieldPath = z.string().describe('Field path in entity.field format');

export const AggregateExpressionSchema = z
  .union([
    z.object({ count: z.string().describe('Field path or "*" for COUNT(*)') }).strict().describe('COUNT'),
    z.object({ sum: fieldPath }).strict().describe('SUM'),
    z.object({ avg: fieldPath }).strict().describe('AVG'),
    z.object({ min: fieldPath }).strict().describe('MIN'),
    z.object({ max: fieldPath }).strict().describe('MAX'),
  ])
  .describe('Aggregate function applied to a field');

export type AggregateExpression = z.infer<typeof AggregateExpressionSchema>;
