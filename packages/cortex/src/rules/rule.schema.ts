// ═══════════════════════════════════════════════════════════
// Rule schemas — Zod definitions for the declarative rule DSL
// ═══════════════════════════════════════════════════════════
//
// Rules are JSON-native, inspectable, serializable. Zod is the
// source of truth for the rule shape, per STYLE_GUIDE §Zod.

import { z } from 'zod';

// ───────────────────────────────────────────────────────────
// Condition value: a literal or a $-path reference
// ───────────────────────────────────────────────────────────

const ConditionValueSchema: z.ZodType<string | number | boolean | null> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

// ───────────────────────────────────────────────────────────
// Condition operators (recursive)
// ───────────────────────────────────────────────────────────

// Forward-declare the recursive type so Zod can handle it.
type ConditionInput =
  | { $eq: [string | number | boolean | null, string | number | boolean | null] }
  | { $neq: [string | number | boolean | null, string | number | boolean | null] }
  | { $gt: [string | number | boolean | null, string | number | boolean | null] }
  | { $gte: [string | number | boolean | null, string | number | boolean | null] }
  | { $lt: [string | number | boolean | null, string | number | boolean | null] }
  | { $lte: [string | number | boolean | null, string | number | boolean | null] }
  | { $and: ConditionInput[] }
  | { $or: ConditionInput[] }
  | { $not: ConditionInput };

const BinaryPair = z.tuple([ConditionValueSchema, ConditionValueSchema]);

export const ConditionSchema: z.ZodType<ConditionInput> = z.lazy(() =>
  z.union([
    z.object({ $eq: BinaryPair }).strict(),
    z.object({ $neq: BinaryPair }).strict(),
    z.object({ $gt: BinaryPair }).strict(),
    z.object({ $gte: BinaryPair }).strict(),
    z.object({ $lt: BinaryPair }).strict(),
    z.object({ $lte: BinaryPair }).strict(),
    z.object({ $and: z.array(ConditionSchema) }).strict(),
    z.object({ $or: z.array(ConditionSchema) }).strict(),
    z.object({ $not: ConditionSchema }).strict(),
  ]),
);

// ───────────────────────────────────────────────────────────
// Accumulator definitions
// ───────────────────────────────────────────────────────────

const CountAccSchema = z.object({
  event: z.string().describe('Bus topic to watch.'),
  aggregate: z.literal('count'),
}).strict();

const SumAccSchema = z.object({
  event: z.string().describe('Bus topic to watch.'),
  aggregate: z.literal('sum'),
  field: z.string().describe('Dot-path into the event payload to sum.'),
}).strict();

const LatestAccSchema = z.object({
  event: z.string().describe('Bus topic to watch.'),
  aggregate: z.literal('latest'),
  field: z.string().describe('Dot-path into the event payload to track.'),
}).strict();

export const AccumulatorDefSchema = z.union([CountAccSchema, SumAccSchema, LatestAccSchema]);

// ───────────────────────────────────────────────────────────
// Effects
// ───────────────────────────────────────────────────────────

export const RuleEffectSchema = z.union([
  z.object({ inject: z.string().describe('System message to inject into context.') }).strict(),
  z.object({ abort: z.string().describe('Reason string for aborting the workflow.') }).strict(),
  z.object({ deny: z.string().describe('Reason string for denying the current tool call.') }).strict(),
  z.object({ call: z.string().describe('Name of a registered effect handler to invoke.') }).strict(),
]);

// ───────────────────────────────────────────────────────────
// Individual rule entry (one when/then pair)
// ───────────────────────────────────────────────────────────

export const RuleEntrySchema = z.object({
  when: ConditionSchema.describe('Condition evaluated against the accumulator scope.'),
  then: RuleEffectSchema.describe('Effect to fire when the condition is true.'),
}).strict();

// ───────────────────────────────────────────────────────────
// Top-level rule definition
// ───────────────────────────────────────────────────────────

export const RuleDefinitionSchema = z.object({
  id: z.string().describe('Unique rule identifier.'),
  description: z.string().optional().describe('Human-readable description of what this rule does.'),
  watch: z.record(z.string(), AccumulatorDefSchema).describe('Named accumulators that track bus events.'),
  rules: z.array(RuleEntrySchema).describe('Ordered list of condition→effect pairs. First match wins per evaluation.'),
}).strict();

export type RuleDefinitionInput = z.input<typeof RuleDefinitionSchema>;
export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;
export type RuleEntry = z.infer<typeof RuleEntrySchema>;
