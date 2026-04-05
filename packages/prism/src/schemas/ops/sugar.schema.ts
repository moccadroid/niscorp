import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

// ═══════════════════════════════════════════════════════════
// Aggregate sugar
// ═══════════════════════════════════════════════════════════

const overOnly = (desc: string) =>
  z.object({ over: z.lazy(node).describe(desc) }).strict();

export const SumNodeSchema = z
  .object({ $sum: overOnly('Array of numbers to sum.') })
  .strict()
  .describe('Sugar: sum all elements in an array. Desugars to $reduce + $add.');
export type SumNode = z.infer<typeof SumNodeSchema>;

export const AvgNodeSchema = z
  .object({ $avg: overOnly('Array of numbers to average.') })
  .strict()
  .describe('Sugar: average all elements in an array. Desugars to $div($sum, $count).');
export type AvgNode = z.infer<typeof AvgNodeSchema>;

export const CountNodeSchema = z
  .object({ $count: overOnly('Array to count elements of.') })
  .strict()
  .describe('Sugar: count elements in an array. Desugars to $reduce.');
export type CountNode = z.infer<typeof CountNodeSchema>;

export const MinNodeSchema = z
  .object({ $min: overOnly('Array of numbers to find minimum.') })
  .strict()
  .describe('Sugar: find minimum value in an array. Desugars to $reduce + $lt.');
export type MinNode = z.infer<typeof MinNodeSchema>;

export const MaxNodeSchema = z
  .object({ $max: overOnly('Array of numbers to find maximum.') })
  .strict()
  .describe('Sugar: find maximum value in an array. Desugars to $reduce + $gt.');
export type MaxNode = z.infer<typeof MaxNodeSchema>;

// ═══════════════════════════════════════════════════════════
// Collection sugar
// ═══════════════════════════════════════════════════════════

export const PluckNodeSchema = z
  .object({
    $pluck: z
      .object({
        over: z.lazy(node).describe('Array of objects to extract from.'),
        key: z.string().min(1).describe('Key to extract from each object.'),
      })
      .strict(),
  })
  .strict()
  .describe('Sugar: extract a single field from each element. Desugars to $map + $get.');
export type PluckNode = z.infer<typeof PluckNodeSchema>;

export const TakeNodeSchema = z
  .object({
    $take: z
      .object({
        from: z.lazy(node).describe('Array to take from.'),
        count: z.number().int().nonnegative().describe('Number of elements to take from the start.'),
      })
      .strict(),
  })
  .strict()
  .describe('Sugar: take first N elements. Desugars to $slice.');
export type TakeNode = z.infer<typeof TakeNodeSchema>;

export const DropNodeSchema = z
  .object({
    $drop: z
      .object({
        from: z.lazy(node).describe('Array to drop from.'),
        count: z.number().int().nonnegative().describe('Number of elements to skip from the start.'),
      })
      .strict(),
  })
  .strict()
  .describe('Sugar: skip first N elements. Desugars to $slice.');
export type DropNode = z.infer<typeof DropNodeSchema>;

export const MatchNodeSchema = z
  .object({
    $match: z
      .object({
        over: z.lazy(node).describe('Array to search within.'),
        as: z.string().min(1).describe('Variable name for the current element.'),
        search: z.lazy(node).describe('String to search for (uses $contains).'),
      })
      .strict(),
  })
  .strict()
  .describe('Sugar: filter array by string containment. Desugars to $filter + $contains.');
export type MatchNode = z.infer<typeof MatchNodeSchema>;

export const FlatMapNodeSchema = z
  .object({
    $flatMap: z
      .object({
        over: z.lazy(node).describe('Array to flat-map over.'),
        as: z.string().min(1).describe('Variable name for the current element.'),
        body: z.lazy(node).describe('Expression that returns an array for each element.'),
      })
      .strict(),
  })
  .strict()
  .describe('Sugar: map then flatten one level. Desugars to $map + $flatten.');
export type FlatMapNode = z.infer<typeof FlatMapNodeSchema>;
