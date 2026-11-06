import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { RefNode, ConstNode, VarNode, GetNode, WithNode } from '../schemas';
import { ErrorCode, failAt } from '../errors';
import { INDEX_TEXT, parseJsonPathCached, getByPath, jsonPathUpTo, whereStopped, type JsonPathSegment, type Step } from '../utils/jsonpath';
import { isJsonObject, isJsonArray } from '../schemas/guards';
import { measure } from '../engine/budget';

const SEGMENTS_KEY = '__segments';

const isSegmentsArray = (value: unknown): value is JsonPathSegment[] => Array.isArray(value);

export const opRef = (node: RefNode, context: EvalContext, _evaluate: EvaluateFn): JsonValue => {
  const attached = Reflect.get(node, SEGMENTS_KEY);
  const segments = isSegmentsArray(attached) ? attached : parseJsonPathCached(node.$ref);
  const resolved = getByPath(context.source, segments);
  if (resolved === undefined) {
    const steps = segments.map((s) => (s.type === 'key' ? s.key : s.index));
    return failAt('Path not found.', ErrorCode.MISSING_PATH, { op: '$ref', path: node.$ref }, {
      node,
      op: '$ref',
      form: false,
      detail: () => `$ref ${JSON.stringify(node.$ref)} ${whereStopped(context.source, steps, (count) => jsonPathUpTo(segments, count))}`,
    });
  }
  return resolved;
};

const copyOf = (value: JsonValue): JsonValue => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(copyOf);
  const copy: Record<string, JsonValue> = {};
  for (const [key, inner] of Object.entries(value)) copy[key] = copyOf(inner);
  return copy;
};

export const opConst = (node: ConstNode, context: EvalContext, _evaluate: EvaluateFn): JsonValue =>
  context.kept === true ? copyOf(node.$const as JsonValue) : (node.$const as JsonValue);

export const opVar = (node: VarNode, context: EvalContext, _evaluate: EvaluateFn): JsonValue => {
  const value = context.vars[node.$var];
  if (value === undefined) {
    const names = Object.keys(context.vars).filter((name) => !name.startsWith('__'));
    const scope = names.length === 0 ? 'No variable is in scope here.' : `In scope: ${names.join(', ')}.`;
    return failAt(`Variable not found: ${node.$var}. ${scope}`, ErrorCode.VAR_NOT_FOUND, { op: '$var', path: node.$var }, { node, op: '$var', form: false });
  }
  return value;
};

const getStopped = (root: JsonValue, steps: readonly Step[]): string =>
  `$get.path ${JSON.stringify(steps)} ${whereStopped(root, steps, (count) => (count === 0 ? 'from' : JSON.stringify(steps.slice(0, count))), true)}`;

export const opGet = (node: GetNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { from, path, fallback } = node.$get;
  const root = evaluate(from, context);
  let current: JsonValue | undefined = root;
  const steps: Step[] = [];

  for (const segment of path) {
    const evaluated = typeof segment === 'object' && segment !== null
      ? evaluate(segment, context)
      : segment;

    if (typeof evaluated === 'number') {
      steps.push(evaluated);
      if (!isJsonArray(current)) {
        if (fallback !== undefined) return evaluate(fallback, context);
        return failAt(getStopped(root, steps), ErrorCode.TYPE, { op: '$get' }, { node, op: '$get', field: 'path', form: true });
      }
      current = current[evaluated];
    } else {
      const key = String(evaluated);
      steps.push(key);
      if (isJsonArray(current) && INDEX_TEXT.test(key)) {
        current = current[Number(key)];
        continue;
      }
      if (!isJsonObject(current)) {
        if (fallback !== undefined) return evaluate(fallback, context);
        return failAt(getStopped(root, steps), ErrorCode.TYPE, { op: '$get' }, { node, op: '$get', field: 'path', form: true });
      }
      current = current[key];
    }
  }

  if (current === undefined) {
    if (fallback !== undefined) return evaluate(fallback, context);
    return failAt('Path not found.', ErrorCode.MISSING_PATH, { op: '$get' }, { node, op: '$get', field: 'path', form: true, detail: () => getStopped(root, steps) });
  }

  return current;
};

export const opWith = (node: WithNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { let: declarations, value } = node.$with;
  const extendedVars = { ...context.vars };
  for (const [name, expr] of Object.entries(declarations)) {
    extendedVars[name] = evaluate(expr, context);
    // Read any number of times below: nested, a binding of [x, x] doubles.
    measure(extendedVars[name] ?? null, context.budget, node);
  }
  return evaluate(value, { ...context, vars: extendedVars });
};
