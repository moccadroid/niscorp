import type { Filter } from '../../schemas/filter.schema.js';
import type { ComputeExpression } from '../../schemas/compute.schema.js';
import type { AggregateExpression } from '../../schemas/aggregate.schema.js';
import type { FieldOrValue } from '../../schemas/value.schema.js';
import type { ParamSlot } from '../adapter.types.js';
import type { FieldSchema } from '../../schemas/database.schema.js';
import { RESERVED_CONTEXT_KEYS } from '../../schemas/request.schema.js';
import { VexError } from '../../errors.js';

// A `$context` ref naming a reserved sort key would otherwise become a bound
// param; reject it at compile so reserved keys only ever drive ORDER BY.
const assertNotReserved = (key: string): void => {
  if (RESERVED_CONTEXT_KEYS.has(key))
    throw new VexError(
      'invalid_dsl',
      `"${key}" is a reserved sort key (applied to ORDER BY); it cannot be bound as a parameter.`,
    );
};

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type PathResolution = { alias: string; column: string; schema: FieldSchema };

type CompilationContext = {
  resolvedPaths: Map<string, PathResolution>;
  aliasMap: Map<string, string>;
  paramSlots: ParamSlot[];
  paramCounter: { value: number };
};

// ═══════════════════════════════════════════════════════════════
// FieldOrValue compilation
// ═══════════════════════════════════════════════════════════════

const isFieldPath = (value: string): boolean => {
  const dotIndex = value.indexOf('.');
  return dotIndex > 0 && dotIndex < value.length - 1;
};

const inferParamType = (path: string, resolvedPaths: Map<string, PathResolution>): ParamSlot['type'] => {
  const res = resolvedPaths.get(path);
  if (res === undefined) return 'string';
  const nt = res.schema.normalizedType;
  if (nt === 'number') return 'number';
  if (nt === 'boolean') return 'boolean';
  return 'string';
};

export const compileFieldOrValue = (
  fov: FieldOrValue,
  ctx: CompilationContext,
): string => {
  if (fov === null) return 'NULL';
  if (typeof fov === 'boolean') return fov ? 'TRUE' : 'FALSE';
  if (typeof fov === 'number') return String(fov);

  if (typeof fov === 'string') {
    if (isFieldPath(fov)) {
      // Resolve to alias.column
      const mapped = ctx.aliasMap.get(fov);
      if (mapped !== undefined) return mapped;
      // Fallback: check resolvedPaths
      const res = ctx.resolvedPaths.get(fov);
      if (res !== undefined) return `${res.alias}.${res.column}`;
      // Unknown path — pass through as quoted string
      return `'${escapeSqlString(fov)}'`;
    }
    // Literal string
    return `'${escapeSqlString(fov)}'`;
  }

  // Object: $context or $scope — after eliminating primitives, only these remain
  if (typeof fov === 'object' && fov !== null && '$context' in fov) {
    const key = fov.$context;
    assertNotReserved(key);
    ctx.paramCounter.value += 1;
    ctx.paramSlots.push({
      key,
      kind: 'context',
      type: inferParamType(key, ctx.resolvedPaths),
    });
    return `$${ctx.paramCounter.value}`;
  }

  if (typeof fov === 'object' && fov !== null && '$scope' in fov) {
    const key = fov.$scope;
    ctx.paramCounter.value += 1;
    ctx.paramSlots.push({
      key,
      kind: 'scope',
      type: inferParamType(key, ctx.resolvedPaths),
    });
    return `$${ctx.paramCounter.value}`;
  }

  return 'NULL';
};

const escapeSqlString = (s: string): string => s.replace(/'/g, "''");

// ═══════════════════════════════════════════════════════════════
// Filter compilation
// ═══════════════════════════════════════════════════════════════

const compileComparisonFilter = (
  op: string,
  pair: [FieldOrValue, FieldOrValue],
  ctx: CompilationContext,
): string => {
  const left = compileFieldOrValue(pair[0], ctx);
  const right = compileFieldOrValue(pair[1], ctx);
  return `${left} ${op} ${right}`;
};

export const compileFilter = (
  filter: Filter,
  ctx: CompilationContext,
): string => {
  if ('eq' in filter) return compileComparisonFilter('=', filter.eq, ctx);
  if ('neq' in filter) return compileComparisonFilter('<>', filter.neq, ctx);
  if ('gt' in filter) return compileComparisonFilter('>', filter.gt, ctx);
  if ('gte' in filter) return compileComparisonFilter('>=', filter.gte, ctx);
  if ('lt' in filter) return compileComparisonFilter('<', filter.lt, ctx);
  if ('lte' in filter) return compileComparisonFilter('<=', filter.lte, ctx);

  if ('in' in filter) {
    const fieldPath = filter.in[0];
    const mapped = ctx.aliasMap.get(fieldPath);
    const col = mapped ?? fieldPath;
    const target = filter.in[1];

    if (Array.isArray(target)) {
      const values = target.map((v) => compileFieldOrValue(v, ctx));
      return `${col} IN (${values.join(', ')})`;
    }

    // ContextRef or ScopeRef → array parameter
    if ('$context' in target) {
      assertNotReserved(target.$context);
      ctx.paramCounter.value += 1;
      ctx.paramSlots.push({ key: target.$context, kind: 'context', type: 'string[]' });
      return `${col} = ANY($${ctx.paramCounter.value})`;
    }
    if ('$scope' in target) {
      ctx.paramCounter.value += 1;
      ctx.paramSlots.push({ key: target.$scope, kind: 'scope', type: 'string[]' });
      return `${col} = ANY($${ctx.paramCounter.value})`;
    }

    return `${col} IN ()`;
  }

  if ('notIn' in filter) {
    const fieldPath = filter.notIn[0];
    const mapped = ctx.aliasMap.get(fieldPath);
    const col = mapped ?? fieldPath;
    const target = filter.notIn[1];

    if (Array.isArray(target)) {
      const values = target.map((v) => compileFieldOrValue(v, ctx));
      return `${col} NOT IN (${values.join(', ')})`;
    }

    if ('$context' in target) {
      assertNotReserved(target.$context);
      ctx.paramCounter.value += 1;
      ctx.paramSlots.push({ key: target.$context, kind: 'context', type: 'string[]' });
      return `${col} <> ALL($${ctx.paramCounter.value})`;
    }
    if ('$scope' in target) {
      ctx.paramCounter.value += 1;
      ctx.paramSlots.push({ key: target.$scope, kind: 'scope', type: 'string[]' });
      return `${col} <> ALL($${ctx.paramCounter.value})`;
    }

    return `${col} NOT IN ()`;
  }

  if ('like' in filter) {
    const fieldPath = filter.like[0];
    const mapped = ctx.aliasMap.get(fieldPath);
    const col = mapped ?? fieldPath;
    const pattern = compileFieldOrValue(filter.like[1], ctx);
    return `${col} LIKE ${pattern}`;
  }

  if ('ilike' in filter) {
    const fieldPath = filter.ilike[0];
    const mapped = ctx.aliasMap.get(fieldPath);
    const col = mapped ?? fieldPath;
    const pattern = compileFieldOrValue(filter.ilike[1], ctx);
    return `${col} ILIKE ${pattern}`;
  }

  if ('isNull' in filter) {
    const mapped = ctx.aliasMap.get(filter.isNull);
    const col = mapped ?? filter.isNull;
    return `${col} IS NULL`;
  }

  if ('isNotNull' in filter) {
    const mapped = ctx.aliasMap.get(filter.isNotNull);
    const col = mapped ?? filter.isNotNull;
    return `${col} IS NOT NULL`;
  }

  if ('and' in filter) {
    const parts = filter.and.map((sub) => compileFilter(sub, ctx));
    return `(${parts.join(' AND ')})`;
  }

  if ('or' in filter) {
    const parts = filter.or.map((sub) => compileFilter(sub, ctx));
    return `(${parts.join(' OR ')})`;
  }

  if ('not' in filter) {
    const inner = compileFilter(filter.not, ctx);
    return `NOT (${inner})`;
  }

  if ('semantic' in filter) {
    // Semantic filter: cosine distance using pgvector <=> operator
    const fieldPath = filter.semantic.field;
    const mapped = ctx.aliasMap.get(fieldPath);
    const col = mapped ?? fieldPath;

    const queryRef = filter.semantic.query;
    const key = '$context' in queryRef ? queryRef.$context : queryRef.$scope;
    if ('$context' in queryRef) assertNotReserved(queryRef.$context);

    // Look up vector dimensions from resolved paths
    const res = ctx.resolvedPaths.get(fieldPath);
    const dimensions = res?.schema.vectorDimensions;

    ctx.paramCounter.value += 1;
    ctx.paramSlots.push({
      key,
      kind: 'semantic',
      type: 'string',
      dimensions,
    });

    const paramRef = `$${ctx.paramCounter.value}`;
    const minScore = filter.semantic.minScore ?? 0;
    return `1 - (${col} <=> ${paramRef}) >= ${minScore}`;
  }

  if ('fuzzy' in filter) {
    const fieldPath = filter.fuzzy.field;
    const mapped = ctx.aliasMap.get(fieldPath);
    const col = mapped ?? fieldPath;

    const queryRef = filter.fuzzy.query;
    const key = '$context' in queryRef ? queryRef.$context : queryRef.$scope;
    const kind = '$context' in queryRef ? 'context' as const : 'scope' as const;
    if ('$context' in queryRef) assertNotReserved(queryRef.$context);

    ctx.paramCounter.value += 1;
    ctx.paramSlots.push({ key, kind, type: 'string' });

    const paramRef = `$${ctx.paramCounter.value}`;
    const maxDistance = filter.fuzzy.maxDistance;

    if (maxDistance !== undefined) {
      return `levenshtein(${col}, ${paramRef}) <= ${maxDistance}`;
    }
    // pg_trgm similarity
    return `${col} % ${paramRef}`;
  }

  // Should not reach here if the filter was validated
  return 'TRUE';
};

// ═══════════════════════════════════════════════════════════════
// Compute expression compilation
// ═══════════════════════════════════════════════════════════════

export const compileCompute = (
  expr: ComputeExpression,
  ctx: CompilationContext,
): string => {
  if ('add' in expr) {
    const a = compileFieldOrValue(expr.add[0], ctx);
    const b = compileFieldOrValue(expr.add[1], ctx);
    return `(${a} + ${b})`;
  }

  if ('subtract' in expr) {
    const a = compileFieldOrValue(expr.subtract[0], ctx);
    const b = compileFieldOrValue(expr.subtract[1], ctx);
    return `(${a} - ${b})`;
  }

  if ('multiply' in expr) {
    const a = compileFieldOrValue(expr.multiply[0], ctx);
    const b = compileFieldOrValue(expr.multiply[1], ctx);
    return `(${a} * ${b})`;
  }

  if ('divide' in expr) {
    const a = compileFieldOrValue(expr.divide[0], ctx);
    const b = compileFieldOrValue(expr.divide[1], ctx);
    return `(${a} / ${b})`;
  }

  if ('concat' in expr) {
    const parts = expr.concat.map((v) => compileFieldOrValue(v, ctx));
    return `(${parts.join(' || ')})`;
  }

  if ('coalesce' in expr) {
    const parts = expr.coalesce.map((v) => compileFieldOrValue(v, ctx));
    return `COALESCE(${parts.join(', ')})`;
  }

  if ('case' in expr) {
    const whenClauses = expr.case.when.map((w) => {
      const cond = compileFilter(w.condition, ctx);
      const val = compileFieldOrValue(w.then, ctx);
      return `WHEN ${cond} THEN ${val}`;
    });
    const elseVal = compileFieldOrValue(expr.case.else, ctx);
    return `CASE ${whenClauses.join(' ')} ELSE ${elseVal} END`;
  }

  return 'NULL';
};

// ═══════════════════════════════════════════════════════════════
// Aggregate expression compilation
// ═══════════════════════════════════════════════════════════════

// SUM/AVG/MIN/MAX take a field path (mapped to its qualified column) OR a
// compute expression (compiled to SQL). count stays a plain field/`*`.
const aggArg = (arg: string | ComputeExpression, ctx: CompilationContext): string =>
  typeof arg === 'string' ? (ctx.aliasMap.get(arg) ?? arg) : compileCompute(arg, ctx);

export const compileAggregate = (
  expr: AggregateExpression,
  ctx: CompilationContext,
): string => {
  if ('count' in expr) {
    if (expr.count === '*') return 'COUNT(*)';
    const mapped = ctx.aliasMap.get(expr.count);
    return `COUNT(${mapped ?? expr.count})`;
  }
  if ('sum' in expr) return `SUM(${aggArg(expr.sum, ctx)})`;
  if ('avg' in expr) return `AVG(${aggArg(expr.avg, ctx)})`;
  if ('min' in expr) return `MIN(${aggArg(expr.min, ctx)})`;
  if ('max' in expr) return `MAX(${aggArg(expr.max, ctx)})`;
  return 'NULL';
};

export type { CompilationContext };
