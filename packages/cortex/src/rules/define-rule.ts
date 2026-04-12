// ═══════════════════════════════════════════════════════════
// defineRule — user-facing factory for declarative rules
// ═══════════════════════════════════════════════════════════
//
// Validates the rule definition against the Zod schema and
// returns a typed RegisteredRule ready for engine.register().
//
// No `as` casts. The engine's RegisteredRule type uses the
// Zod-inferred types directly, so parse() output flows
// through without widening or narrowing.

import { RuleDefinitionSchema, type RuleDefinitionInput } from './rule.schema';
import type { RegisteredRule } from './engine';

export const defineRule = (input: RuleDefinitionInput): RegisteredRule => {
  const parsed = RuleDefinitionSchema.parse(input);
  return {
    id: parsed.id,
    ...(parsed.description !== undefined && { description: parsed.description }),
    watch: parsed.watch,
    rules: parsed.rules,
  };
};
