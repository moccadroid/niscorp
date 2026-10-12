import { z } from 'zod';

export const jsonSchemaOf = (schema: z.ZodType): Record<string, unknown> =>
  JSON.parse(JSON.stringify(z.toJSONSchema(schema)));
