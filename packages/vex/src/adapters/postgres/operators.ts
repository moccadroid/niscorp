import type { Filter } from '../../schemas/filter.schema.js';
import type { ComputeExpression } from '../../schemas/compute.schema.js';
import type { AggregateExpression } from '../../schemas/aggregate.schema.js';
import type { FieldOrValue } from '../../schemas/value.schema.js';
import type { ParamSlot } from '../adapter.types.js';
import type { FieldSchema } from '../../schemas/database.schema.js';
import type { ResolvedExists, ResolvedJoin } from '../../engine/engine.types.js';
import { RESERVED_CONTEXT_KEYS } from '../../schemas/request.schema.js';
import { refuseOptional } from '../../engine/optional.js';
import { VexError } from '../../errors.js';
import { isFieldPathShape } from '../../schemas/identifier.schema.js';

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
  // Every `exists` in this query's filter, resolved. Keyed by the node, because
  // the compiler walks the raw filter tree and needs to find the resolution for
  // the node in front of it.
  existsMap?: Map<object, ResolvedExists>;
};

// ═══════════════════════════════════════════════════════════════
// FieldOrValue compilation
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// SQL TEXT — the only three ways authored input reaches a statement.
//
//   · a COLUMN, which must have resolved against the introspected schema —
//     `columnOf` emits the resolver's alias.column or refuses. There is no
//     "pass it through" branch, anywhere: the fallback that used to exist here
//     pasted whatever string sat in a field position into the statement.
//   · a LITERAL, quoted by `quoteLiteral` exactly as Postgres's own
//     quote_literal() does, so it is safe whatever standard_conforming_strings
//     says.
//   · an OUTPUT NAME, quoted by `quoteIdent`.
//
// Values from a request never reach text at all: they bind as parameters.
// ═══════════════════════════════════════════════════════════════

export const quoteLiteral = (s: string): string => {
  const doubled = s.replace(/'/g, "''");
  // With standard_conforming_strings off, a backslash in '…' is an escape and
  // `\'` closes the string. The E'' form escapes backslashes explicitly, so the
  // literal means the same thing under either setting.
  return s.includes('\\') ? `E'${doubled.replace(/\\/g, '\\\\')}'` : `'${doubled}'`;
};

export const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

// A number that is not finite has no SQL spelling — `NaN` would read as a name.
export const numberLiteral = (n: number): string => {
  if (!Number.isFinite(n)) throw new VexError('invalid_dsl', `${String(n)} is not a number SQL can hold.`);
  return String(n);
};

const columnOf = (path: string, ctx: CompilationContext): string => {
  const mapped = ctx.aliasMap.get(path);
  if (mapped !== undefined) return mapped;
  const res = ctx.resolvedPaths.get(path);
  if (res !== undefined) return `${res.alias}.${res.column}`;
  throw new VexError('invalid_dsl', `"${path}" is not a column this query reads.`);
};

const isFieldPath = isFieldPathShape;

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
  if (typeof fov === 'number') return numberLiteral(fov);

  if (typeof fov === 'string') {
    // Shaped like a column → it is one, and it resolved (or this refuses).
    // Anything else is a literal.
    return isFieldPath(fov) ? columnOf(fov, ctx) : quoteLiteral(fov);
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


// ═══════════════════════════════════════════════════════════════
// Join pairs
//
// The whole key, one equality per column pair, for the query's joins and
// the joins inside an `exists` alike — two emitters, one rule, so a
// composite key can never be half-joined in one of them.
// ═══════════════════════════════════════════════════════════════

export const compileJoinPairs = (join: ResolvedJoin): string[] =>
  join.fromColumns.map((column, i) => {
    const to = join.toColumns[i];
    if (to === undefined) {
      throw new VexError(
        'invalid_dsl',
        `The join from "${join.fromAlias}" to "${join.toAlias}" pairs "${column}" with no column.`,
      );
    }
    return `${join.fromAlias}.${column} = ${join.toAlias}.${to}`;
  });

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
  // EXISTS compiles INLINE, into the parent's own parameter counter and slot
  // list. That is deliberate: the other subquery path compiles independently
  // and then tries to renumber, which is how two parameterised subqueries came
  // to collide on $1. There is nothing to renumber if nothing was numbered
  // separately.
  //
  // `SELECT 1` because EXISTS asks whether a row is there, not what is in it.
  if ('exists' in filter) {
    const resolved = ctx.existsMap?.get(filter.exists);
    if (resolved === undefined) throw new VexError('invalid_dsl', 'An "exists" filter was not resolved. It must appear in a query\'s own filter.');

    const inner: CompilationContext = {
      ...ctx,
      resolvedPaths: resolved.filter?.resolvedPaths ?? ctx.resolvedPaths,
      // The inner map LAYERS OVER the outer one, so an inner path resolves to
      // the inner alias and an outer path — the correlation — still resolves.
      aliasMap: new Map([...ctx.aliasMap, ...resolved.aliasMap]),
    };

    const parts: string[] = ['SELECT 1'];
    const first = resolved.sources[0];
    if (first?.table !== undefined) parts.push(`FROM ${first.table} AS ${first.alias}`);
    for (const join of resolved.joins) {
      const source = resolved.sources.find((s) => s.alias === join.toAlias);
      if (source?.table === undefined) continue;
      const keyword = join.kind === 'left' ? 'LEFT JOIN' : 'JOIN';
      const conditions = [
        ...compileJoinPairs(join),
        ...(join.on ?? []).map((extra) => compileFilter(extra.original, inner)),
      ];
      parts.push(`${keyword} ${source.table} AS ${join.toAlias} ON ${conditions.join(' AND ')}`);
    }
    if (resolved.filter !== undefined) parts.push(`WHERE ${compileFilter(resolved.filter.original, inner)}`);

    return `EXISTS (${parts.join(' ')})`;
  }

  if ('eq' in filter) return compileComparisonFilter('=', filter.eq, ctx);
  if ('neq' in filter) return compileComparisonFilter('<>', filter.neq, ctx);
  if ('gt' in filter) return compileComparisonFilter('>', filter.gt, ctx);
  if ('gte' in filter) return compileComparisonFilter('>=', filter.gte, ctx);
  if ('lt' in filter) return compileComparisonFilter('<', filter.lt, ctx);
  if ('lte' in filter) return compileComparisonFilter('<=', filter.lte, ctx);

  if ('in' in filter) {
    const col = columnOf(filter.in[0], ctx);
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
    const col = columnOf(filter.notIn[0], ctx);
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
    const col = columnOf(filter.like[0], ctx);
    const pattern = compileFieldOrValue(filter.like[1], ctx);
    return `${col} LIKE ${pattern}`;
  }

  if ('ilike' in filter) {
    const col = columnOf(filter.ilike[0], ctx);
    const pattern = compileFieldOrValue(filter.ilike[1], ctx);
    return `${col} ILIKE ${pattern}`;
  }

  if ('isNull' in filter) {
    return `${columnOf(filter.isNull, ctx)} IS NULL`;
  }

  if ('isNotNull' in filter) {
    return `${columnOf(filter.isNotNull, ctx)} IS NOT NULL`;
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
    const col = columnOf(fieldPath, ctx);

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
    const minScore = numberLiteral(filter.semantic.minScore ?? 0);
    return `1 - (${col} <=> ${paramRef}) >= ${minScore}`;
  }

  if ('fuzzy' in filter) {
    const col = columnOf(filter.fuzzy.field, ctx);

    const queryRef = filter.fuzzy.query;
    const key = '$context' in queryRef ? queryRef.$context : queryRef.$scope;
    const kind = '$context' in queryRef ? 'context' as const : 'scope' as const;
    if ('$context' in queryRef) assertNotReserved(queryRef.$context);

    ctx.paramCounter.value += 1;
    ctx.paramSlots.push({ key, kind, type: 'string' });

    const paramRef = `$${ctx.paramCounter.value}`;
    const maxDistance = filter.fuzzy.maxDistance;

    if (maxDistance !== undefined) {
      return `levenshtein(${col}, ${paramRef}) <= ${numberLiteral(maxDistance)}`;
    }
    // pg_trgm similarity
    return `${col} % ${paramRef}`;
  }

  // Resolved away before the pipeline — see engine/optional.ts. Named
  // explicitly because the fallthrough below is `TRUE`: an unrecognised node
  // would quietly compile to "match everything", which for an optional
  // condition is the right answer reached by the wrong route, and for anything
  // else is a filter that silently stopped filtering.
  if ('optional' in filter) refuseOptional('SQL compilation');

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
  typeof arg === 'string' ? columnOf(arg, ctx) : compileCompute(arg, ctx);

export const compileAggregate = (
  expr: AggregateExpression,
  ctx: CompilationContext,
): string => {
  if ('count' in expr) {
    if (expr.count === '*') return 'COUNT(*)';
    return `COUNT(${columnOf(expr.count, ctx)})`;
  }
  if ('countDistinct' in expr) return `COUNT(DISTINCT ${columnOf(expr.countDistinct, ctx)})`;
  if ('sum' in expr) return `SUM(${aggArg(expr.sum, ctx)})`;
  if ('avg' in expr) return `AVG(${aggArg(expr.avg, ctx)})`;
  if ('min' in expr) return `MIN(${aggArg(expr.min, ctx)})`;
  if ('max' in expr) return `MAX(${aggArg(expr.max, ctx)})`;
  return 'NULL';
};

export type { CompilationContext };
