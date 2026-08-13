import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

export const JoinNodeSchema = z
  .object({
    $join: z
      .object({
        parts: z.array(z.lazy(node)).min(1).describe('Values to concatenate (coerced to string).'),
        sep: z.string().optional().default('').describe('Separator between parts. Default: "".'),
      })
      .strict(),
  })
  .strict()
  .describe('Concatenate values into a string with an optional separator.');
export type JoinNode = z.infer<typeof JoinNodeSchema>;

export const ToStringNodeSchema = z
  .object({ $toString: z.lazy(node).describe('Value to stringify via String().') })
  .strict()
  .describe('Convert a value to its string representation.');
export type ToStringNode = z.infer<typeof ToStringNodeSchema>;

export const InterpolateNodeSchema = z
  .object({
    $interpolate: z
      .object({
        template: z.string().describe('Template with {{key}} placeholders.'),
        values: z.lazy(node).describe('Object whose keys replace {{key}} placeholders.'),
      })
      .strict(),
  })
  .strict()
  .describe('Replace {{key}} placeholders in a template with values from an object.');
export type InterpolateNode = z.infer<typeof InterpolateNodeSchema>;

export const FillNodeSchema = z
  .object({
    $fill: z
      .lazy(node)
      .describe('A pattern value `{ phrase, slots }` — filled with its own slots, source language. Non-patterns pass through.'),
  })
  .strict()
  .describe('Fill a counted phrase: `{ phrase: "{n} of {total}", slots: { n: 1, total: 12 } }` → "1 of 12".');
export type FillNode = z.infer<typeof FillNodeSchema>;

export const TrimNodeSchema = z
  .object({ $trim: z.lazy(node).describe('String to trim whitespace from.') })
  .strict()
  .describe('Trim leading and trailing whitespace from a string.');
export type TrimNode = z.infer<typeof TrimNodeSchema>;

export const LowerNodeSchema = z
  .object({ $lower: z.lazy(node).describe('String to lowercase.') })
  .strict()
  .describe('Convert a string to lowercase.');
export type LowerNode = z.infer<typeof LowerNodeSchema>;

export const UpperNodeSchema = z
  .object({ $upper: z.lazy(node).describe('String to uppercase.') })
  .strict()
  .describe('Convert a string to uppercase.');
export type UpperNode = z.infer<typeof UpperNodeSchema>;

export const SplitNodeSchema = z
  .object({
    $split: z
      .object({
        value: z.lazy(node).describe('String to split.'),
        sep: z.string().describe('Separator to split on.'),
      })
      .strict(),
  })
  .strict()
  .describe('Split a string into an array by separator.');
export type SplitNode = z.infer<typeof SplitNodeSchema>;

export const ReplaceNodeSchema = z
  .object({
    $replace: z
      .object({
        value: z.lazy(node).describe('String to search in.'),
        search: z.string().describe('Substring to find.'),
        replacement: z.string().describe('Replacement string.'),
      })
      .strict(),
  })
  .strict()
  .describe('Replace the first occurrence of a substring.');
export type ReplaceNode = z.infer<typeof ReplaceNodeSchema>;
