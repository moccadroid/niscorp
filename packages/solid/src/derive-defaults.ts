import { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// Schema default derivation
// ═══════════════════════════════════════════════════════════

export const deriveDefaults = (schema: z.ZodType): unknown => {
  return deriveFromType(schema);
};

// ───────────────────────────────────────────────────────────
// Internal derivation by Zod type
// ───────────────────────────────────────────────────────────

const deriveFromType = (schema: z.ZodType): unknown => {
  if (schema instanceof z.ZodDefault) {
    return schema._zod.def.defaultValue;
  }

  if (schema instanceof z.ZodOptional) {
    return undefined;
  }

  if (schema instanceof z.ZodNullable) {
    return null;
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const result: Record<string, unknown> = {};
    for (const [key, fieldSchema] of Object.entries(shape)) {
      result[key] = deriveFromType(fieldSchema as z.ZodType);
    }
    return result;
  }

  if (schema instanceof z.ZodArray) {
    return [];
  }

  if (schema instanceof z.ZodString) {
    return '';
  }

  if (schema instanceof z.ZodNumber) {
    return 0;
  }

  if (schema instanceof z.ZodBoolean) {
    return false;
  }

  if (schema instanceof z.ZodEnum) {
    // Zod v4 enum entries are a Record<string, string>
    const values = Object.values(schema._zod.def.entries);
    if (values.length > 0) return values[0];
  }

  if (schema instanceof z.ZodLiteral) {
    const values = [...schema._zod.def.values];
    if (values.length > 0) return values[0];
  }

  if (schema instanceof z.ZodUnion) {
    const options = (schema._zod.def.options ?? []) as z.ZodType[];
    const first = options[0];
    if (first) return deriveFromType(first);
  }

  return undefined;
};
