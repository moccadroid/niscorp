import { z } from 'zod';

export const ContextRefSchema = z
  .object({
    $context: z.string().describe('Key to look up in the request context object'),
  })
  .strict()
  .describe('Reference to a caller-provided context value');

export const ScopeRefSchema = z
  .object({
    $scope: z.string().describe('Key to look up in the server-side scope values'),
  })
  .strict()
  .describe('Reference to a server-injected scope value (access control)');

export const FieldOrValueSchema = z
  .union([
    z.string().describe('A field path (entity.field format) or a literal string'),
    z.number().describe('A literal number'),
    z.boolean().describe('A literal boolean'),
    z.null().describe('A literal null'),
    ContextRefSchema,
    ScopeRefSchema,
  ])
  .describe('A field path, literal value, or dynamic reference');

export type ContextRef = z.infer<typeof ContextRefSchema>;
export type ScopeRef = z.infer<typeof ScopeRefSchema>;
export type FieldOrValue = z.infer<typeof FieldOrValueSchema>;
