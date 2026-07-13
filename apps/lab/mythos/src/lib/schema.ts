import { z } from 'zod';

// An action's `input` field wants a plain JSON-Schema record. z.toJSONSchema
// returns zod's own JSONSchema interface type; the round-trip re-types it as a
// plain record without a type assertion.
export const jsonSchemaOf = (schema: z.ZodType): Record<string, unknown> =>
  JSON.parse(JSON.stringify(z.toJSONSchema(schema)));
