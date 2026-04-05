import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { RefNode, ConstNode, VarNode, GetNode, WithNode } from '../schemas';
import { PrismError, ErrorCode } from '../errors';
import { parseJsonPathCached, getByPath } from '../utils/jsonpath';
import { isJsonObject, isJsonArray } from '../schemas/guards';

export const opRef = (node: RefNode, context: EvalContext, _evaluate: EvaluateFn): JsonValue => {
  const segments = parseJsonPathCached(node.$ref);
  const resolved = getByPath(context.source, segments);
  if (resolved === undefined)
    throw new PrismError('Path not found', ErrorCode.MISSING_PATH, { op: '$ref', path: node.$ref });
  return resolved;
};

export const opConst = (node: ConstNode, _context: EvalContext, _evaluate: EvaluateFn): JsonValue =>
  node.$const as JsonValue;

export const opVar = (node: VarNode, context: EvalContext, _evaluate: EvaluateFn): JsonValue => {
  const value = context.vars[node.$var];
  if (value === undefined)
    throw new PrismError(`Variable not found: ${node.$var}`, ErrorCode.VAR_NOT_FOUND, { op: '$var', path: node.$var });
  return value;
};

export const opGet = (node: GetNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { from, path, fallback } = node.$get;
  let current: JsonValue | undefined = evaluate(from, context);

  for (const segment of path) {
    const evaluated = typeof segment === 'object' && segment !== null
      ? evaluate(segment, context)
      : segment;

    if (typeof evaluated === 'number') {
      if (!isJsonArray(current)) {
        if (fallback !== undefined) return evaluate(fallback, context);
        throw new PrismError('Expected array for index access', ErrorCode.TYPE, { op: '$get' });
      }
      current = current[evaluated];
    } else {
      const key = String(evaluated);
      if (!isJsonObject(current)) {
        if (fallback !== undefined) return evaluate(fallback, context);
        throw new PrismError('Expected object for key access', ErrorCode.TYPE, { op: '$get' });
      }
      current = current[key];
    }
  }

  if (current === undefined) {
    if (fallback !== undefined) return evaluate(fallback, context);
    throw new PrismError('Path not found', ErrorCode.MISSING_PATH, { op: '$get' });
  }

  return current;
};

export const opWith = (node: WithNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { let: declarations, value } = node.$with;
  const extendedVars = { ...context.vars };
  for (const [name, expr] of Object.entries(declarations)) {
    extendedVars[name] = evaluate(expr, context);
  }
  return evaluate(value, { ...context, vars: extendedVars });
};
