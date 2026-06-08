import type { Query } from '../schemas/query.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { ComputeExpression } from '../schemas/compute.schema.js';
import type { AggregateExpression } from '../schemas/aggregate.schema.js';
import type { FieldOrValue } from '../schemas/value.schema.js';

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

export const extractEntityFromPath = (path: string): string | undefined => {
  const parts = path.split('.');
  return parts.length === 2 ? parts[0] : undefined;
};

const collectFromFieldOrValue = (fov: FieldOrValue, out: Set<string>): void => {
  if (typeof fov === 'string') {
    const entity = extractEntityFromPath(fov);
    if (entity !== undefined) out.add(entity);
  }
  // numbers, booleans, null, $context, $scope — no entity to extract
};

// ───────────────────────────────────────────────────────────────
// Filter walker
// ───────────────────────────────────────────────────────────────

const collectFromFilter = (filter: Filter, out: Set<string>): void => {
  if ('eq' in filter || 'neq' in filter || 'gt' in filter || 'gte' in filter || 'lt' in filter || 'lte' in filter) {
    const pair = ('eq' in filter) ? filter.eq
      : ('neq' in filter) ? filter.neq
      : ('gt' in filter) ? filter.gt
      : ('gte' in filter) ? filter.gte
      : ('lt' in filter) ? filter.lt
      : filter.lte;
    collectFromFieldOrValue(pair[0], out);
    collectFromFieldOrValue(pair[1], out);
    return;
  }

  if ('in' in filter || 'notIn' in filter) {
    const tuple = 'in' in filter ? filter.in : filter.notIn;
    const entity = extractEntityFromPath(tuple[0]);
    if (entity !== undefined) out.add(entity);
    const target = tuple[1];
    if (Array.isArray(target)) {
      for (const v of target) {
        collectFromFieldOrValue(v, out);
      }
    }
    // ContextRef / ScopeRef — no entity
    return;
  }

  if ('like' in filter || 'ilike' in filter) {
    const tuple = 'like' in filter ? filter.like : filter.ilike;
    const entity = extractEntityFromPath(tuple[0]);
    if (entity !== undefined) out.add(entity);
    collectFromFieldOrValue(tuple[1], out);
    return;
  }

  if ('isNull' in filter) {
    const entity = extractEntityFromPath(filter.isNull);
    if (entity !== undefined) out.add(entity);
    return;
  }

  if ('isNotNull' in filter) {
    const entity = extractEntityFromPath(filter.isNotNull);
    if (entity !== undefined) out.add(entity);
    return;
  }

  if ('and' in filter) {
    for (const sub of filter.and) {
      collectFromFilter(sub, out);
    }
    return;
  }

  if ('or' in filter) {
    for (const sub of filter.or) {
      collectFromFilter(sub, out);
    }
    return;
  }

  if ('not' in filter) {
    collectFromFilter(filter.not, out);
    return;
  }

  if ('semantic' in filter) {
    const entity = extractEntityFromPath(filter.semantic.field);
    if (entity !== undefined) out.add(entity);
    return;
  }

  if ('fuzzy' in filter) {
    const entity = extractEntityFromPath(filter.fuzzy.field);
    if (entity !== undefined) out.add(entity);
    return;
  }
};

// ───────────────────────────────────────────────────────────────
// Compute walker
// ───────────────────────────────────────────────────────────────

const collectFromCompute = (expr: ComputeExpression, out: Set<string>): void => {
  if ('add' in expr || 'subtract' in expr || 'multiply' in expr || 'divide' in expr) {
    const pair = ('add' in expr) ? expr.add
      : ('subtract' in expr) ? expr.subtract
      : ('multiply' in expr) ? expr.multiply
      : expr.divide;
    collectFromFieldOrValue(pair[0], out);
    collectFromFieldOrValue(pair[1], out);
    return;
  }

  if ('concat' in expr) {
    for (const v of expr.concat) {
      collectFromFieldOrValue(v, out);
    }
    return;
  }

  if ('coalesce' in expr) {
    for (const v of expr.coalesce) {
      collectFromFieldOrValue(v, out);
    }
    return;
  }

  if ('case' in expr) {
    for (const when of expr.case.when) {
      collectFromFilter(when.condition, out);
      collectFromFieldOrValue(when.then, out);
    }
    collectFromFieldOrValue(expr.case.else, out);
    return;
  }
};

// ───────────────────────────────────────────────────────────────
// Aggregate walker
// ───────────────────────────────────────────────────────────────

const collectFromAggregate = (expr: AggregateExpression, out: Set<string>): void => {
  // Each aggregate variant has a single string field path
  const path = ('count' in expr) ? expr.count
    : ('sum' in expr) ? expr.sum
    : ('avg' in expr) ? expr.avg
    : ('min' in expr) ? expr.min
    : expr.max;
  const entity = extractEntityFromPath(path);
  if (entity !== undefined) out.add(entity);
};

// ───────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────

const collectFromQuery = (dsl: Query, out: Set<string>): void => {
  // from
  for (const source of dsl.from) {
    if (typeof source === 'string') {
      out.add(source);
    } else {
      // subquery: recurse
      collectFromQuery(source.query, out);
    }
  }

  // fields
  for (const field of dsl.fields) {
    const entity = extractEntityFromPath(field);
    if (entity !== undefined) out.add(entity);
  }

  // filter
  if (dsl.filter !== undefined) {
    collectFromFilter(dsl.filter, out);
  }

  // compute
  if (dsl.compute !== undefined) {
    for (const key of Object.keys(dsl.compute)) {
      const expr = dsl.compute[key];
      if (expr !== undefined) {
        collectFromCompute(expr, out);
      }
    }
  }

  // aggregate
  if (dsl.aggregate !== undefined) {
    for (const key of Object.keys(dsl.aggregate)) {
      const expr = dsl.aggregate[key];
      if (expr !== undefined) {
        collectFromAggregate(expr, out);
      }
    }
  }

  // groupBy
  if (dsl.groupBy !== undefined) {
    for (const path of dsl.groupBy) {
      const entity = extractEntityFromPath(path);
      if (entity !== undefined) out.add(entity);
    }
  }

  // sort
  if (dsl.sort !== undefined) {
    for (const entry of dsl.sort) {
      const entity = extractEntityFromPath(entry.field);
      if (entity !== undefined) out.add(entity);
    }
  }
};

export const discoverEntities = (dsl: Query): Set<string> => {
  const entities = new Set<string>();
  collectFromQuery(dsl, entities);
  return entities;
};
