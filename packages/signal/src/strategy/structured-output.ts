import { z } from 'zod';
import type { Capabilities, ProviderRequest } from '../types';

// ═══════════════════════════════════════════════════════════
// Strategy: How to request structured output from the provider
// ═══════════════════════════════════════════════════════════

export type StructuredOutputStrategy = 'json_schema' | 'json_mode' | 'prompt_only';

export const selectStructuredOutputStrategy = (capabilities: Capabilities): StructuredOutputStrategy => {
  if (capabilities.nativeJsonSchema) return 'json_schema';
  if (capabilities.nativeJsonMode) return 'json_mode';
  return 'prompt_only';
};

export const applyStructuredOutput = (
  request: ProviderRequest,
  schema: z.ZodType,
  strategy: StructuredOutputStrategy,
): ProviderRequest => {
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;

  switch (strategy) {
    case 'json_schema':
      return {
        ...request,
        responseFormat: {
          type: 'json_schema',
          jsonSchema: { name: 'response', strict: false, schema: jsonSchema },
        },
      };
    case 'json_mode':
      return {
        ...request,
        responseFormat: { type: 'json_object' },
        // Schema goes in system prompt for json_mode
        messages: injectSchemaIntoSystemPrompt(request.messages, jsonSchema),
      };
    case 'prompt_only':
      return {
        ...request,
        messages: injectSchemaIntoSystemPrompt(request.messages, jsonSchema),
      };
  }
};

const injectSchemaIntoSystemPrompt = (
  messages: ProviderRequest['messages'],
  jsonSchema: Record<string, unknown>,
): ProviderRequest['messages'] => {
  const schemaInstruction = `\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(jsonSchema, null, 2)}`;
  const [first, ...rest] = messages;
  if (first?.role === 'system') {
    return [{ ...first, content: `${first.content}${schemaInstruction}` }, ...rest];
  }
  return [{ role: 'system', content: schemaInstruction.trim() }, ...messages];
};
