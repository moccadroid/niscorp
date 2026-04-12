// ═══════════════════════════════════════════════════════════
// Rules engine — evaluates rules at runtime check points
// ═══════════════════════════════════════════════════════════
//
// The engine manages the lifecycle of rules for a manifold:
//   1. When a rule is registered, its accumulators attach to the bus
//   2. At evaluation points (before pipeline build, before tool call,
//      before tick), the engine checks all rules against their
//      accumulator state
//   3. The first matching rule's effect is returned
//   4. On workflow end, accumulators are reset
//
// The engine is a pure coordinator. It does not execute effects —
// the caller (manifold, tool loop, etc.) interprets the effect.

import type { Bus, BudgetState, Unsubscribe } from '../types';
import type { ConditionScope } from './condition';
import type { EffectRegistry, EffectContext } from './effects';
import type { WatchDefs, AccumulatorState } from './accumulator';
import type { RuleEntry, RuleDefinition } from './rule.schema';
import { evaluateCondition } from './condition';
import { attachAccumulators } from './accumulator';
import { isCallEffect } from './effects';

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

// RegisteredRule is the runtime representation. It uses the
// Zod-inferred types directly (RuleEntry, RuleDefinition) so
// there are no `as` casts between define-time and eval-time.
export type RegisteredRule = {
  id: string;
  description?: string;
  watch: WatchDefs;
  rules: ReadonlyArray<RuleEntry>;
};

// The effect shape from a RuleEntry's `then` field. Zod-inferred,
// not hand-written. Use the type guards from effects.ts to narrow.
export type RuleEffect = RuleEntry['then'];

export type EvaluationResult =
  | { matched: false }
  | { matched: true; ruleId: string; effect: RuleEffect };

export type RulesEngine = {
  /** Register a rule. Returns an unsubscribe function. */
  register: (rule: RegisteredRule) => Unsubscribe;
  /**
   * Evaluate all registered rules. Returns the first matching
   * effect, or { matched: false } if no rule fires.
   * Optional budget is injected into the scope as $budget.*.
   */
  evaluate: (budget?: BudgetState) => EvaluationResult;
  /**
   * Execute a `call` effect by looking up the handler in the
   * effect registry. No-op if the effect is not a `call` effect
   * or the handler is not registered.
   */
  executeCallEffect: (effect: RuleEffect, ctx: EffectContext) => Promise<void>;
  /** Snapshot of all accumulator states, keyed by rule id. Useful for inspection. */
  snapshot: () => Record<string, Record<string, unknown>>;
  /** Reset all accumulators (e.g. on workflow end). */
  reset: () => void;
  /** Detach all bus subscriptions and clean up. */
  destroy: () => void;
};

// ───────────────────────────────────────────────────────────
// Factory
// ───────────────────────────────────────────────────────────

export const createRulesEngine = (
  bus: Bus,
  effectRegistry: EffectRegistry,
): RulesEngine => {
  const entries: Array<{
    rule: RegisteredRule;
    accState: AccumulatorState;
    unsub: Unsubscribe;
  }> = [];

  const register = (rule: RegisteredRule): Unsubscribe => {
    const { state: accState, unsub } = attachAccumulators(bus, rule.watch);
    const entry = { rule, accState, unsub };
    entries.push(entry);
    return () => {
      unsub();
      const idx = entries.indexOf(entry);
      if (idx >= 0) entries.splice(idx, 1);
    };
  };

  const evaluate = (budget?: BudgetState): EvaluationResult => {
    for (const entry of entries) {
      const watchValues = entry.accState.values();
      const scope: ConditionScope = {
        watch: watchValues,
        ...(budget && { budget }),
      };
      for (const r of entry.rule.rules) {
        if (evaluateCondition(r.when, scope)) {
          return { matched: true, ruleId: entry.rule.id, effect: r.then };
        }
      }
    }
    return { matched: false };
  };

  const executeCallEffect = async (effect: RuleEffect, ctx: EffectContext): Promise<void> => {
    if (!isCallEffect(effect)) return;
    const handler = effectRegistry.get(effect.call);
    if (handler) await handler(ctx);
  };

  const snapshot = (): Record<string, Record<string, unknown>> => {
    const result: Record<string, Record<string, unknown>> = {};
    for (const entry of entries) {
      result[entry.rule.id] = entry.accState.values();
    }
    return result;
  };

  const reset = (): void => {
    for (const entry of entries) entry.accState.reset();
  };

  const destroy = (): void => {
    for (const entry of entries) entry.unsub();
    entries.length = 0;
  };

  return { register, evaluate, executeCallEffect, snapshot, reset, destroy };
};
