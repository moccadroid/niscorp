import { z } from 'zod';

export const IfDirectiveSchema = z
  .object({
    $if: z.unknown().describe('Condition — resolved recursively, then checked for truthiness.'),
    $then: z.unknown().describe('Value when condition is truthy — resolved recursively.'),
    $else: z
      .unknown()
      .optional()
      .describe('Value when condition is falsy — resolved recursively.'),
  })
  .strict()
  .describe('Conditional value directive. Resolved at bind time.');

export type IfDirective = z.infer<typeof IfDirectiveSchema>;

export const ResolvableSchema = z
  .unknown()
  .describe(
    'Any value. Strings support {{}} templates and bare $-paths. Objects may be '
      + 'directives like {$if,$then,$else}. Arrays and nested objects are walked '
      + 'recursively. Everything else is literal.',
  );
