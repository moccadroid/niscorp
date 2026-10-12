import type { ZodType } from 'zod';

export type SchemaDocOptions = {
  title?: string;
};

// Converted by the schema's own zod, not by cortex's: the caller's schema may
// come from another copy of zod, whose metadata this copy's registry does not hold.
const toJsonSchemaString = (schema: ZodType): string => {
  const convert = schema['~standard'].jsonSchema.output;
  try {
    return JSON.stringify(convert({ target: 'draft-07' }));
  } catch {
    return JSON.stringify(convert({ target: 'draft-07', libraryOptions: { unrepresentable: 'any' } }));
  }
};

export const schemaDoc = (schema: ZodType, options?: SchemaDocOptions): string => {
  const title = options?.title ?? 'OUTPUT SCHEMA';
  return `${title} — your output MUST validate against this JSON Schema:\n${toJsonSchemaString(schema)}`;
};
