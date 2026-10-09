import type { EvalContext, JsonValue } from '../types';

// The scope of a loop: the context its body is evaluated in, and the variables
// the loop sets for each item. Made once for the loop, not once for each item
// — a new context and a new set of variables per item was a fifth of the time
// of a $map over 10,000 rows. It is the loop's own copy: the context it was
// given is not written to, so a variable of the same name outside the loop is
// what it was when the loop is done, and a loop inside the body copies this
// one in turn. Nothing keeps a scope past the evaluation of one body.
export const loopScope = (context: EvalContext): { scope: EvalContext; vars: Record<string, JsonValue> } => {
  const vars = { ...context.vars };
  return { scope: { ...context, vars }, vars };
};
