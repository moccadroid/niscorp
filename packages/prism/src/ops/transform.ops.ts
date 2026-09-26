import type { JsonValue, JsonObject, EvalContext, EvaluateFn } from '../types';
import type { HasNode, RenameKeysNode, UpdateNode, AssertNode, WalkNode } from '../schemas';
import { PrismError, ErrorCode } from '../errors';
import { isJsonObject, isJsonArray } from '../schemas/guards';

type Segment = string | number;

const has = (value: JsonValue, path: readonly Segment[]): boolean => {
  let at: JsonValue = value;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!isJsonArray(at) || segment >= at.length) return false;
      at = at[segment] ?? null;
    } else {
      if (!isJsonObject(at) || !Object.prototype.hasOwnProperty.call(at, segment)) return false;
      at = at[segment] ?? null;
    }
  }
  return true;
};

export const opHas = (node: HasNode, context: EvalContext, evaluate: EvaluateFn): JsonValue =>
  has(evaluate(node.$has.from, context), node.$has.path);

export const opRenameKeys = (node: RenameKeysNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$renameKeys.from, context);
  if (!isJsonObject(value)) throw new PrismError('Expected object for $renameKeys', ErrorCode.TYPE, { op: '$renameKeys' });
  const { map } = node.$renameKeys;
  const renamedTo = new Set(Object.entries(map).filter(([from]) => Object.prototype.hasOwnProperty.call(value, from)).map(([, to]) => to));
  const result: JsonObject = {};
  for (const [key, v] of Object.entries(value)) {
    const target = map[key];
    if (target !== undefined) result[target] = v;
    // An existing key a rename lands on is replaced by the renamed entry.
    else if (!renamedTo.has(key)) result[key] = v;
  }
  return result;
};

const current = (value: JsonValue, path: readonly Segment[]): JsonValue => {
  let at: JsonValue = value;
  for (const segment of path) {
    if (typeof segment === 'number') at = isJsonArray(at) ? (at[segment] ?? null) : null;
    else at = isJsonObject(at) ? (at[segment] ?? null) : null;
  }
  return at;
};

const setIn = (value: JsonValue, path: readonly Segment[], next: JsonValue, full: readonly Segment[]): JsonValue => {
  const [head, ...rest] = path;
  if (head === undefined) return next;
  if (typeof head === 'number') {
    if (!isJsonArray(value) || head >= value.length) {
      throw new PrismError(`No array item at ${full.join('.')}`, ErrorCode.MISSING_PATH, { op: '$update', path: full.join('.') });
    }
    return value.map((item, i) => (i === head ? setIn(item, rest, next, full) : item));
  }
  // A missing (or non-object) step along a string path becomes an object.
  const base: JsonObject = isJsonObject(value) ? value : {};
  return { ...base, [head]: setIn(base[head] ?? null, rest, next, full) };
};

export const opUpdate = (node: UpdateNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { from, path, value, as } = node.$update;
  const source = evaluate(from, context);
  const next = evaluate(value, { ...context, vars: { ...context.vars, [as ?? 'current']: current(source, path) } });
  return setIn(source, path, next, path);
};

export const opAssert = (node: AssertNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  if (!evaluate(node.$assert.when, context)) throw new PrismError(node.$assert.message, ErrorCode.ASSERT, { op: '$assert' });
  return evaluate(node.$assert.value, context);
};

export const opWalk = (node: WalkNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const { over, as, rules, order } = node.$walk;

  const rewrite = (value: JsonValue): { matched: boolean; value: JsonValue } => {
    const scope = { ...context, vars: { ...context.vars, [as]: value } };
    for (const rule of rules) {
      if (evaluate(rule.when, scope)) return { matched: true, value: evaluate(rule.then, scope) };
    }
    return { matched: false, value };
  };

  const children = (value: JsonValue, visit: (v: JsonValue) => JsonValue): JsonValue => {
    if (isJsonArray(value)) return value.map(visit);
    if (isJsonObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)]));
    return value;
  };

  // Post-order: children first, then the node's rules see them rewritten.
  const post = (value: JsonValue): JsonValue => rewrite(children(value, post)).value;
  // Pre-order: the node's rules first, then the walk descends into the result.
  const pre = (value: JsonValue): JsonValue => children(rewrite(value).value, pre);

  return (order ?? 'post') === 'pre' ? pre(evaluate(over, context)) : post(evaluate(over, context));
};
