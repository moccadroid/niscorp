import { z } from 'zod';

import { JsonValueSchema } from '../json.schema';

// Forward reference — set by node.schema.ts after NodeSchema is created
let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

// ═══════════════════════════════════════════════════════════
// $ref — Resolve JSONPath against source
// ═══════════════════════════════════════════════════════════

export const RefNodeSchema = z
  .object({
    $ref: z
      .string()
      .regex(/^\$\./)
      .describe('JSONPath starting with $. — e.g. "$.user.name", "$.items[0].sku". Only reads from source data, not variables. For variables use $var, for navigating into variables use $get.'),
  })
  .strict()
  .describe('Read a value from the source data by static JSONPath. Use $ref for source access, $var for variables, $get for navigating into variables or dynamic paths.');

export type RefNode = z.infer<typeof RefNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $const — Literal value
// ═══════════════════════════════════════════════════════════

export const ConstNodeSchema = z
  .object({
    $const: JsonValueSchema.describe('Any JSON value to return as-is.'),
  })
  .strict()
  .describe('Return a literal JSON value unchanged.');

export type ConstNode = z.infer<typeof ConstNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $var — Read variable from scope
// ═══════════════════════════════════════════════════════════

export const VarNodeSchema = z
  .object({
    $var: z.string().min(1).describe('Variable name bound by $with, $map, $filter, $reduce, or $sortBy.'),
  })
  .strict()
  .describe('Read a scoped variable by name. Variables are created by $with (let bindings), $map/$filter/$reduce/$sortBy (loop element). Returns the whole variable — use $get to navigate into it.');

export type VarNode = z.infer<typeof VarNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $get — Dynamic path access
// ═══════════════════════════════════════════════════════════

export const GetNodeSchema = z
  .object({
    $get: z
      .object({
        from: z.lazy(node).describe('Source value to navigate into.'),
        path: z
          .array(z.union([z.string(), z.number(), z.lazy(node)]))
          .min(1)
          .describe('Path segments: string keys, numeric indices, or node expressions.'),
        fallback: z.lazy(node).optional().describe('Fallback value when path is missing.'),
      })
      .strict(),
  })
  .strict()
  .describe('Navigate into a value by path. Use to access fields on variables: {$get: {from: {$var: "item"}, path: ["name"]}}. Also supports dynamic path segments (nodes as segments) and fallback values. Prefer $ref for simple source access.');

export type GetNode = z.infer<typeof GetNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $with — Variable scoping
// ═══════════════════════════════════════════════════════════

export const WithNodeSchema = z
  .object({
    $with: z
      .object({
        let: z
          .record(z.string(), z.lazy(node))
          .describe('Variable bindings: name → expression evaluated in current scope.'),
        value: z.lazy(node).describe('Expression evaluated with the declared variables in scope.'),
      })
      .strict(),
  })
  .strict()
  .describe('Bind variables in a scoped block: { $with: { let: { x: ... }, value: ... } }');

export type WithNode = z.infer<typeof WithNodeSchema>;
