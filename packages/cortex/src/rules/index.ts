// Barrel for src/rules
export { defineRule } from './define-rule';
export { createRulesEngine } from './engine';
export type { RegisteredRule, EvaluationResult, RulesEngine, RuleEffect } from './engine';
export { createEffectRegistry, isInjectEffect, isAbortEffect, isDenyEffect, isCallEffect } from './effects';
export type { EffectContext, EffectHandler, EffectRegistry } from './effects';
export { evaluateCondition } from './condition';
export type { ConditionScope } from './condition';
export { attachAccumulators } from './accumulator';
export type { AccumulatorDef, WatchDefs, AccumulatorState } from './accumulator';
export {
  RuleDefinitionSchema,
  RuleEntrySchema,
  RuleEffectSchema,
  ConditionSchema,
  AccumulatorDefSchema,
} from './rule.schema';
export type { RuleDefinition, RuleDefinitionInput, RuleEntry } from './rule.schema';
