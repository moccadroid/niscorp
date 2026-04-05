import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

// ═══════════════════════════════════════════════════════════
// $map — Transform each element
// ═══════════════════════════════════════════════════════════

export const MapNodeSchema = z
  .object({
    $map: z
      .object({
        over: z.lazy(node).describe('Array to iterate over.'),
        as: z.string().min(1).describe('Variable name for the current element.'),
        body: z.lazy(node).describe('Expression evaluated for each element.'),
      })
      .strict(),
  })
  .strict()
  .describe('Map over an array, transforming each element.');

export type MapNode = z.infer<typeof MapNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $filter — Keep matching elements
// ═══════════════════════════════════════════════════════════

export const FilterNodeSchema = z
  .object({
    $filter: z
      .object({
        over: z.lazy(node).describe('Array to filter.'),
        as: z.string().min(1).describe('Variable name for the current element.'),
        when: z.lazy(node).describe('Condition — keeps element when truthy.'),
      })
      .strict(),
  })
  .strict()
  .describe('Filter an array, keeping elements where condition is truthy.');

export type FilterNode = z.infer<typeof FilterNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $reduce — Fold/accumulate
// ═══════════════════════════════════════════════════════════

export const ReduceNodeSchema = z
  .object({
    $reduce: z
      .object({
        over: z.lazy(node).describe('Array to reduce.'),
        as: z.string().min(1).describe('Variable name for the current element.'),
        acc: z.string().min(1).optional().default('acc').describe('Accumulator variable name. Default: "acc".'),
        init: z.lazy(node).describe('Initial accumulator value.'),
        body: z.lazy(node).describe('Expression evaluated for each element with both element and accumulator in scope.'),
      })
      .strict(),
  })
  .strict()
  .describe('Reduce an array to a single value using an accumulator.');

export type ReduceNode = z.infer<typeof ReduceNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $slice — Array/string slice
// ═══════════════════════════════════════════════════════════

export const SliceNodeSchema = z
  .object({
    $slice: z
      .object({
        from: z.lazy(node).describe('Array or string to slice.'),
        start: z.number().int().optional().describe('Start index (inclusive). Default: 0.'),
        end: z.number().int().optional().describe('End index (exclusive). Default: length.'),
      })
      .strict(),
  })
  .strict()
  .describe('Slice an array or string by start/end indices.');

export type SliceNode = z.infer<typeof SliceNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $flatten — Flatten one level
// ═══════════════════════════════════════════════════════════

export const FlattenNodeSchema = z
  .object({
    $flatten: z.lazy(node).describe('Array of arrays to flatten one level.'),
  })
  .strict()
  .describe('Flatten a nested array by one level.');

export type FlattenNode = z.infer<typeof FlattenNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $unique — Deduplicate
// ═══════════════════════════════════════════════════════════

export const UniqueNodeSchema = z
  .object({
    $unique: z.lazy(node).describe('Array to deduplicate.'),
  })
  .strict()
  .describe('Remove duplicate values from an array (compared by JSON.stringify).');

export type UniqueNode = z.infer<typeof UniqueNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $sortBy — Sort by computed key
// ═══════════════════════════════════════════════════════════

export const SortByNodeSchema = z
  .object({
    $sortBy: z
      .object({
        over: z.lazy(node).describe('Array to sort.'),
        as: z.string().min(1).describe('Variable name for the current element.'),
        by: z.lazy(node).describe('Expression to compute the sort key.'),
        dir: z.enum(['asc', 'desc']).optional().default('asc').describe('Sort direction. Default: "asc".'),
      })
      .strict(),
  })
  .strict()
  .describe('Sort an array by a computed key.');

export type SortByNode = z.infer<typeof SortByNodeSchema>;
