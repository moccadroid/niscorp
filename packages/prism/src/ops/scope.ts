import type { EvalContext, JsonValue } from '../types';

// One scope for the whole loop, its variables overwritten for each item, not a
// scope per item: nothing keeps a scope past the evaluation of one body.
export const loopScope = (context: EvalContext): { scope: EvalContext; vars: Record<string, JsonValue> } => {
  const vars = { ...context.vars };
  return { scope: { ...context, vars }, vars };
};
