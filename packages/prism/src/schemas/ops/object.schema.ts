import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

export const KeysNodeSchema = z
  .object({ $keys: z.lazy(node).describe('Object to extract keys from.') })
  .strict()
  .describe('Return the keys of an object as a string array.');
export type KeysNode = z.infer<typeof KeysNodeSchema>;

export const ValuesNodeSchema = z
  .object({ $values: z.lazy(node).describe('Object to extract values from.') })
  .strict()
  .describe('Return the values of an object as an array.');
export type ValuesNode = z.infer<typeof ValuesNodeSchema>;

export const FromEntriesNodeSchema = z
  .object({
    $fromEntries: z
      .lazy(node)
      .describe('Array of [key, value] pairs to convert to an object.'),
  })
  .strict()
  .describe('Convert [key, value][] entries into an object.');
export type FromEntriesNode = z.infer<typeof FromEntriesNodeSchema>;

export const PickNodeSchema = z
  .object({
    $pick: z
      .object({
        from: z.lazy(node).describe('Source object.'),
        keys: z.array(z.string()).min(1).describe('Keys to keep.'),
      })
      .strict(),
  })
  .strict()
  .describe('Pick specific keys from an object, discarding the rest.');
export type PickNode = z.infer<typeof PickNodeSchema>;

export const OmitNodeSchema = z
  .object({
    $omit: z
      .object({
        from: z.lazy(node).describe('Source object.'),
        keys: z.array(z.string()).min(1).describe('Keys to remove.'),
      })
      .strict(),
  })
  .strict()
  .describe('Remove specific keys from an object, keeping the rest.');
export type OmitNode = z.infer<typeof OmitNodeSchema>;

export const TypeNodeSchema = z
  .object({ $type: z.lazy(node).describe('Value to get the type of.') })
  .strict()
  .describe('Returns the type as a string: "string", "number", "boolean", "null", "array", or "object".');
export type TypeNode = z.infer<typeof TypeNodeSchema>;

export const LengthNodeSchema = z
  .object({ $length: z.lazy(node).describe('Array or string to measure.') })
  .strict()
  .describe('Return the length of an array or string.');
export type LengthNode = z.infer<typeof LengthNodeSchema>;
