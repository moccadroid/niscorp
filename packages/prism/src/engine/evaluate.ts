import { explainIssues, issuesText } from '../utils/issues';
import type { JsonValue, JsonObject, EvalContext, EvaluateFn, Result } from '../types';
import type { Config } from '../schemas/config.schema';
import { ConfigSchema } from '../schemas/config.schema';
import { OPTIONAL_FIELDS_KEY } from '../schemas/node.schema';
import { PrismError, ErrorCode, clip, failAt } from '../errors';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import { desugar } from '../sugar/desugar';
import { createBudget, measure, measureString, spendStep, stackRefusal, type Limits } from './budget';
import { optimize, resolveHandler } from './optimize';
import { placeError } from './place';
import { writeOwnKey } from '../utils/own-keys';
import { isPlainObject } from '../schemas/guards';

const HANDLER_KEY = '__op';

type AttachedFn = (node: Record<string, unknown>, context: EvalContext, evaluate: EvaluateFn) => JsonValue;

const isAttachedFn = (value: unknown): value is AttachedFn => typeof value === 'function';

export const evaluateNode: EvaluateFn = (node: unknown, context: EvalContext): JsonValue => {
  const { budget } = context;
  if (budget === undefined) return evaluateUnbudgeted(node, context);
  spendStep(budget, node);
  const out = evaluateUnbudgeted(node, context);
  measureString(out, budget, node);
  return out;
};

const evaluateUnbudgeted = (node: unknown, context: EvalContext): JsonValue => {
  if (node === null || node === undefined) return null;
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return node;

  if (Array.isArray(node)) return node.map((n) => evaluateNode(n, context));

  if (typeof node !== 'object') return null;

  const obj = node as Record<string, unknown>;

  const attached = obj[HANDLER_KEY];
  if (isAttachedFn(attached)) return attached(obj, context, evaluateNode);

  // Before the ops, though no node is both: a template has no handler attached,
  // so placed last it would fall through every guard, in a compiled tree too.
  if (isPlainObject(obj)) {
    const result: Record<string, JsonValue> = {};
    if (!(OPTIONAL_FIELDS_KEY in obj)) {
      for (const key of Object.keys(obj)) writeOwnKey(result, key, evaluateNode(obj[key], context));
      return result;
    }
    const optionalFields = new Set<string>(
      Array.isArray(obj[OPTIONAL_FIELDS_KEY]) ? (obj[OPTIONAL_FIELDS_KEY] as string[]) : [],
    );

    for (const [key, value] of Object.entries(obj)) {
      if (key === OPTIONAL_FIELDS_KEY) continue;
      const isOptional = optionalFields.has(key);

      try {
        const evaluated = evaluateNode(value, context);
        if (isOptional && (evaluated === null || evaluated === undefined)) continue;
        writeOwnKey(result, key, evaluated);
      } catch (error) {
        if (isOptional && error instanceof PrismError && error.code === ErrorCode.MISSING_PATH) continue;
        throw error;
      }
    }

    return result;
  }

  const handler = resolveHandler(obj);
  if (handler !== undefined) return handler(obj, context, evaluateNode);

  const unknownKeys = Object.keys(obj).filter((k) => k.startsWith('$'));
  const preview = JSON.stringify(obj).slice(0, 100);
  return failAt(
    `No op answers this node: ${clip(JSON.stringify(obj), 100)} (keys: ${unknownKeys.join(', ')}). The tree did not go through the schema.`,
    ErrorCode.NODE_SHAPE,
    { details: { keys: unknownKeys, preview } },
    { node: obj, form: false },
  );
};

const notJson = (value: unknown, at: string): string | undefined => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : `${at} is ${value}`;
  if (Array.isArray(value)) {
    for (const index of Object.keys(value)) {
      const found = notJson(value[Number(index)], `${at}[${index}]`);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return `${at} is ${value === undefined ? 'undefined' : `a ${typeof value}`}`;
  // A Date, a Map or an instance of a class has no fields to look at and would
  // pass for `{}`.
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    const tag = Object.prototype.toString.call(value).slice(8, -1);
    return `${at} is ${tag === 'Object' ? 'an instance of a class' : `a ${tag}`}`;
  }
  for (const [key, inner] of Object.entries(value)) {
    const found = notJson(inner, `${at}.${key}`);
    if (found !== undefined) return found;
  }
  return undefined;
};

const checked = (config: unknown): unknown => {
  if (exceedsDepth(config)) throw new PrismError(`Invalid config: ${depthRefusal()}`, ErrorCode.SCHEMA, { details: { issues: [{ path: 'root', message: depthRefusal() }] } });
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    const explained = explainIssues(parsed.error.issues, config);
    const issues = explained.map((i) => ({ path: i.path.join('.') || 'root', message: i.message }));
    throw new PrismError(`Invalid config: ${issuesText(explained)}`, ErrorCode.SCHEMA, { details: { issues } });
  }
  return desugar(parsed.data);
};

const run = (tree: unknown, source: JsonValue, limits: Partial<Limits> | undefined, kept: boolean, authored: unknown): JsonValue => {
  const budget = createBudget(limits);
  try {
    const result = evaluateNode(tree, kept ? { source, vars: {}, budget, kept } : { source, vars: {}, budget });
    measure(result, budget);
    return result;
  } catch (error) {
    placeError(error, tree, authored);
    throw error;
  }
};

export type EvaluateOptions = {
  limits?: Partial<Limits>;
  check?: 'always';
};

type Kept = { tree: unknown; optimized: boolean };
const keptTrees = new WeakMap<object, Kept>();

// A config object is checked the first time it is seen and its tree kept; the
// tree is optimized the second time. Not the first: a config handed over once
// would pay for an optimization nothing uses. Kept by the object, so a config
// changed in place after its first call is not read again.
const evaluateOnce = (config: Config, source: unknown, options?: EvaluateOptions): JsonValue => {
  if (options?.check === 'always') {
    const wrong = notJson(source, 'source');
    if (wrong !== undefined) throw new PrismError(`The source must be plain JSON: ${wrong}.`, ErrorCode.TYPE);
    return run(checked(config), source as JsonValue, options.limits, false, config);
  }
  const input = source as JsonValue;
  if (typeof config !== 'object' || config === null) return run(checked(config), input, options?.limits, false, config);
  let kept = keptTrees.get(config);
  if (kept === undefined) {
    kept = { tree: checked(config), optimized: false };
    keptTrees.set(config, kept);
  } else if (!kept.optimized) {
    kept.tree = optimize(kept.tree, evaluateNode).node;
    kept.optimized = true;
  }
  return run(kept.tree, input, options?.limits, true, config);
};

export const evaluate = (config: Config, source: unknown, options?: EvaluateOptions): JsonValue => {
  try {
    return evaluateOnce(config, source, options);
  } catch (error) {
    throw stackRefusal(error);
  }
};

export const evaluateSafe = (config: Config, source: unknown, options?: EvaluateOptions): Result<JsonValue> => {
  try {
    return { ok: true, data: evaluate(config, source, options) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
};
