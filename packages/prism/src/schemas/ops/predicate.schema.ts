import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

const pairOf = (desc: string) =>
  z.tuple([z.lazy(node), z.lazy(node)]).describe(desc);

// ═══════════════════════════════════════════════════════════
// Comparison predicates
// ═══════════════════════════════════════════════════════════

export const EqNodeSchema = z
  .object({ $eq: pairOf('Two values to compare for deep equality.') })
  .strict()
  .describe('Deep equality comparison (JSON.stringify-based). Returns true or false.');
export type EqNode = z.infer<typeof EqNodeSchema>;

export const NeqNodeSchema = z
  .object({ $neq: pairOf('Two values to compare for inequality.') })
  .strict()
  .describe('Deep inequality comparison. Returns true or false.');
export type NeqNode = z.infer<typeof NeqNodeSchema>;

export const GtNodeSchema = z
  .object({ $gt: pairOf('Two values: returns true if first > second (numbers or strings).') })
  .strict()
  .describe('Greater than comparison for numbers or strings.');
export type GtNode = z.infer<typeof GtNodeSchema>;

export const GteNodeSchema = z
  .object({ $gte: pairOf('Two values: returns true if first >= second.') })
  .strict()
  .describe('Greater than or equal comparison.');
export type GteNode = z.infer<typeof GteNodeSchema>;

export const LtNodeSchema = z
  .object({ $lt: pairOf('Two values: returns true if first < second.') })
  .strict()
  .describe('Less than comparison.');
export type LtNode = z.infer<typeof LtNodeSchema>;

export const LteNodeSchema = z
  .object({ $lte: pairOf('Two values: returns true if first <= second.') })
  .strict()
  .describe('Less than or equal comparison.');
export type LteNode = z.infer<typeof LteNodeSchema>;

// ═══════════════════════════════════════════════════════════
// Emptiness check
// ═══════════════════════════════════════════════════════════

export const EmptyNodeSchema = z
  .object({ $empty: z.lazy(node).describe('Value to check for emptiness (null, "", [], {}).') })
  .strict()
  .describe('Returns true if value is null, empty string, empty array, or empty object.');
export type EmptyNode = z.infer<typeof EmptyNodeSchema>;

// ═══════════════════════════════════════════════════════════
// String predicates
// ═══════════════════════════════════════════════════════════

export const StartsWithNodeSchema = z
  .object({
    $startsWith: z
      .object({
        value: z.lazy(node).describe('String to check.'),
        prefix: z.lazy(node).describe('Expected prefix.'),
      })
      .strict(),
  })
  .strict()
  .describe('Returns true if string starts with prefix.');
export type StartsWithNode = z.infer<typeof StartsWithNodeSchema>;

export const EndsWithNodeSchema = z
  .object({
    $endsWith: z
      .object({
        value: z.lazy(node).describe('String to check.'),
        suffix: z.lazy(node).describe('Expected suffix.'),
      })
      .strict(),
  })
  .strict()
  .describe('Returns true if string ends with suffix.');
export type EndsWithNode = z.infer<typeof EndsWithNodeSchema>;

export const ContainsNodeSchema = z
  .object({
    $contains: z
      .object({
        value: z.lazy(node).describe('String to search in.'),
        search: z.lazy(node).describe('Substring to find.'),
      })
      .strict(),
  })
  .strict()
  .describe('Returns true if string contains the search substring.');
export type ContainsNode = z.infer<typeof ContainsNodeSchema>;
