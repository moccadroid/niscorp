// ═══════════════════════════════════════════════════════════
// Effects — what happens when a rule fires
// ═══════════════════════════════════════════════════════════
//
// Four built-in effects:
//   - inject: adds a system message to context on next pipeline build
//   - abort:  terminates the workflow with an error
//   - deny:   blocks the current tool call (only at tool-call check)
//   - call:   invokes a registered effect function by name
//
// The RuleEffect type is Zod-inferred from RuleEffectSchema.
// Type guards narrow the union for callers that need to dispatch.

import type { RuleEntry } from './rule.schema';

// ───────────────────────────────────────────────────────────
// The effect type — derived from Zod, not hand-written
// ───────────────────────────────────────────────────────────

export type RuleEffect = RuleEntry['then'];

// ───────────────────────────────────────────────────────────
// Effect context (passed to registered `call` handlers)
// ───────────────────────────────────────────────────────────

export type EffectContext = {
  workflowId: string;
  agentId: string;
  tick: number;
  ruleId: string;
};

export type EffectHandler = (ctx: EffectContext) => void | Promise<void>;

// ───────────────────────────────────────────────────────────
// Effect registry — named handlers for the `call` effect
// ───────────────────────────────────────────────────────────

export type EffectRegistry = {
  register: (name: string, handler: EffectHandler) => void;
  get: (name: string) => EffectHandler | undefined;
  has: (name: string) => boolean;
};

export const createEffectRegistry = (): EffectRegistry => {
  const handlers = new Map<string, EffectHandler>();
  return {
    register: (name, handler) => { handlers.set(name, handler); },
    get: (name) => handlers.get(name),
    has: (name) => handlers.has(name),
  };
};

// ───────────────────────────────────────────────────────────
// Type guards — narrow the Zod-inferred union
// ───────────────────────────────────────────────────────────

const isEffectObject = (effect: unknown): effect is Record<string, unknown> =>
  effect !== null && typeof effect === 'object' && !Array.isArray(effect);

export const isInjectEffect = (effect: RuleEffect): effect is { inject: string } =>
  isEffectObject(effect) && 'inject' in effect;

export const isAbortEffect = (effect: RuleEffect): effect is { abort: string } =>
  isEffectObject(effect) && 'abort' in effect;

export const isDenyEffect = (effect: RuleEffect): effect is { deny: string } =>
  isEffectObject(effect) && 'deny' in effect;

export const isCallEffect = (effect: RuleEffect): effect is { call: string } =>
  isEffectObject(effect) && 'call' in effect;
