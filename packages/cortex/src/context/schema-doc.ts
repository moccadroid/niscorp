// ═══════════════════════════════════════════════════════════
// schemaDoc — render a Zod schema as prompt documentation
// ═══════════════════════════════════════════════════════════
//
// Single-sourced from the same schema Zod validates against, so
// docs and validation cannot drift (STYLE_GUIDE: schemas are the
// single source of truth for LLM agents; put constraints in
// .describe(), never in hand-written prose).
//
// Minified per STYLE_GUIDE — never pretty-print JSON in prompts.

import { z, type ZodType } from 'zod';

export type SchemaDocOptions = {
  title?: string;
};

const toJsonSchemaString = (schema: ZodType): string => {
  try {
    return JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7' }));
  } catch {
    // Schemas with refinements or other unrepresentable pieces still
    // document everything else; the runtime Zod validation keeps the
    // full contract authoritative.
    return JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' }));
  }
};

export const schemaDoc = (schema: ZodType, options?: SchemaDocOptions): string => {
  const title = options?.title ?? 'OUTPUT SCHEMA';
  return `${title} — your output MUST validate against this JSON Schema:\n${toJsonSchemaString(schema)}`;
};
