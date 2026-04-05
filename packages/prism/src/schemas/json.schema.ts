import { z } from 'zod';

export const JsonPrimitiveSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .describe('JSON primitive: string | number | boolean | null');

export const JsonValueSchema: z.ZodType<
  string | number | boolean | null | unknown[] | Record<string, unknown>
> = z.lazy(() =>
  z.union([JsonPrimitiveSchema, z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)]),
).describe('Any JSON value: primitive, array, or object');

export const JsonObjectSchema = z
  .record(z.string(), JsonValueSchema)
  .describe('JSON object mapping string keys to JSON values');
