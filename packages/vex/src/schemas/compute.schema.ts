import { z } from 'zod';
import { FieldOrValueSchema } from './value.schema.js';
import { FilterSchema } from './filter.schema.js';

const CaseWhenSchema = z
  .object({
    condition: FilterSchema,
    then: FieldOrValueSchema.describe('Value when condition is true'),
  })
  .strict();

export const ComputeExpressionSchema = z
  .union([
    z.object({ add: z.tuple([FieldOrValueSchema, FieldOrValueSchema]) }).strict().describe('Addition: a + b'),
    z.object({ subtract: z.tuple([FieldOrValueSchema, FieldOrValueSchema]) }).strict().describe('Subtraction: a - b'),
    z.object({ multiply: z.tuple([FieldOrValueSchema, FieldOrValueSchema]) }).strict().describe('Multiplication: a * b'),
    z.object({ divide: z.tuple([FieldOrValueSchema, FieldOrValueSchema]) }).strict().describe('Division: a / b'),
    z.object({ concat: z.array(FieldOrValueSchema).min(2) }).strict().describe('String concatenation'),
    z.object({ coalesce: z.array(FieldOrValueSchema).min(2) }).strict().describe('Returns first non-null value'),
    z.object({
      case: z
        .object({
          when: z.array(CaseWhenSchema).min(1).describe('Condition/result pairs evaluated in order'),
          else: FieldOrValueSchema.describe('Default value when no condition matches'),
        })
        .strict(),
    }).strict().describe('CASE WHEN conditional expression'),
  ])
  .describe('Computed expression: arithmetic, string, or conditional');

export type ComputeExpression = z.infer<typeof ComputeExpressionSchema>;
