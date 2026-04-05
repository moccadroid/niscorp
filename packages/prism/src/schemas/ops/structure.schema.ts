import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

export const MergeNodeSchema = z
  .object({
    $merge: z
      .array(z.lazy(node))
      .min(1)
      .describe('Objects to shallow-merge (left to right, later wins).'),
  })
  .strict()
  .describe('Shallow merge multiple objects. Later values overwrite earlier ones.');
export type MergeNode = z.infer<typeof MergeNodeSchema>;

export const CoalesceNodeSchema = z
  .object({
    $coalesce: z
      .array(z.lazy(node))
      .min(1)
      .describe('Values to try in order. Returns first non-null/non-undefined.'),
  })
  .strict()
  .describe('Return the first non-null, non-undefined value.');
export type CoalesceNode = z.infer<typeof CoalesceNodeSchema>;

export const CaseNodeSchema = z
  .object({
    $case: z
      .object({
        branches: z
          .array(
            z.object({
              when: z.lazy(node).describe('Condition to evaluate.'),
              then: z.lazy(node).describe('Value to return if condition is truthy.'),
            }).strict(),
          )
          .min(1)
          .describe('Ordered list of when/then branches.'),
        else: z.lazy(node).optional().describe('Fallback value if no branch matches. Default: null.'),
      })
      .strict(),
  })
  .strict()
  .describe('Conditional branching: evaluates branches in order, returns first match or else.');
export type CaseNode = z.infer<typeof CaseNodeSchema>;

export const EntriesOfNodeSchema = z
  .object({ $entriesOf: z.lazy(node).describe('Object to convert to [key, value][] entries.') })
  .strict()
  .describe('Convert an object to an array of [key, value] pairs.');
export type EntriesOfNode = z.infer<typeof EntriesOfNodeSchema>;

export const KeyByNodeSchema = z
  .object({
    $keyBy: z
      .object({
        over: z.lazy(node).describe('Array to group.'),
        as: z.string().min(1).describe('Variable name for the current element.'),
        key: z.lazy(node).describe('Expression to compute the key (last wins on collision).'),
      })
      .strict(),
  })
  .strict()
  .describe('Convert an array to an object keyed by a computed value. Last element wins on key collision.');
export type KeyByNode = z.infer<typeof KeyByNodeSchema>;

export const GroupByNodeSchema = z
  .object({
    $groupBy: z
      .object({
        over: z.lazy(node).describe('Array to group.'),
        as: z.string().min(1).describe('Variable name for the current element.'),
        key: z.lazy(node).describe('Expression to compute the group key.'),
      })
      .strict(),
  })
  .strict()
  .describe('Group array elements into an object of arrays by computed key.');
export type GroupByNode = z.infer<typeof GroupByNodeSchema>;
