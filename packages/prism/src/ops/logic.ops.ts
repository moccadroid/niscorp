import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { NotNode, AndNode, OrNode } from '../schemas';

export const opNot = (node: NotNode, context: EvalContext, evaluate: EvaluateFn): JsonValue =>
  !evaluate(node.$not, context);

export const opAnd = (node: AndNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  let last: JsonValue = true;
  for (const operand of node.$and) {
    last = evaluate(operand, context);
    if (!last) return last;
  }
  return last;
};

export const opOr = (node: OrNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  let last: JsonValue = false;
  for (const operand of node.$or) {
    last = evaluate(operand, context);
    if (last) return last;
  }
  return last;
};
