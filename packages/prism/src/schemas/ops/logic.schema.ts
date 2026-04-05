import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

export const NotNodeSchema = z
  .object({ $not: z.lazy(node).describe('Value to negate (truthy → false, falsy → true).') })
  .strict()
  .describe('Boolean negation of a truthy/falsy value.');
export type NotNode = z.infer<typeof NotNodeSchema>;

export const AndNodeSchema = z
  .object({
    $and: z
      .array(z.lazy(node))
      .min(1)
      .describe('Values to AND. Short-circuits: returns last truthy or first falsy.'),
  })
  .strict()
  .describe('Short-circuit logical AND.');
export type AndNode = z.infer<typeof AndNodeSchema>;

export const OrNodeSchema = z
  .object({
    $or: z
      .array(z.lazy(node))
      .min(1)
      .describe('Values to OR. Short-circuits: returns first truthy or last falsy.'),
  })
  .strict()
  .describe('Short-circuit logical OR.');
export type OrNode = z.infer<typeof OrNodeSchema>;
