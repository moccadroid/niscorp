import type { Query } from '../schemas/query.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { ScopePolicy, ScopeEntityRule } from './scope.types.js';

// ───────────────────────────────────────────────────────────────
// Error
// ───────────────────────────────────────────────────────────────

export class VexScopeError extends Error {
  readonly code = 'scope_denied' as const;
  readonly entity: string;

  constructor(entity: string, message: string) {
    super(message);
    this.name = 'VexScopeError';
    this.entity = entity;
  }
}

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

const andMerge = (existing: Filter | undefined, additions: Filter[]): Filter | undefined => {
  if (additions.length === 0) return existing;

  const allFilters: Filter[] = [];
  if (existing !== undefined) allFilters.push(existing);
  allFilters.push(...additions);

  if (allFilters.length === 1) {
    const single = allFilters[0];
    return single !== undefined ? single : undefined;
  }
  return { and: allFilters };
};

// The WHERE filters scope adds to a READ of one entity — or a throw if access is
// denied. A `match` under `read` becomes `entity.col = $scope.to`. An entity
// with no rule (or a listed entity with no `read` block) falls back to the
// policy default: 'deny' throws, 'allow' adds nothing.
const readFiltersFor = (entity: string, rule: ScopeEntityRule | undefined, def: 'allow' | 'deny'): Filter[] => {
  if (rule === undefined) {
    if (def === 'deny') throw new VexScopeError(entity, `Entity "${entity}" is not allowed by scope policy (default: deny)`);
    return [];
  }
  if ('public' in rule) return [];
  if ('deny' in rule) throw new VexScopeError(entity, `Entity "${entity}" is denied by scope policy`);
  if (rule.read === undefined) {
    if (def === 'deny') throw new VexScopeError(entity, `Reads of "${entity}" are not allowed by scope policy (default: deny)`);
    return [];
  }
  return rule.read.map((m) => ({ eq: [`${entity}.${m.match}`, { $scope: m.to }] }));
};

// ───────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────

// RLS filters attach at the query level whose `from` actually lists the
// table — a `tasks` rule lands inside the subquery that reads tasks, never
// on an outer query that only sees the subquery's alias.
const applyScopeLevel = (dsl: Query, policy: ScopePolicy): Query => {
  const newFrom = dsl.from.map((source) => {
    if (typeof source === 'string') return source;
    return { as: source.as, query: applyScopeLevel(source.query, policy) };
  });

  const scopeFilters: Filter[] = [];
  for (const source of dsl.from) {
    if (typeof source === 'string') {
      scopeFilters.push(...readFiltersFor(source, policy.entities[source], policy.default));
    }
  }

  const mergedFilter = andMerge(dsl.filter, scopeFilters);

  return {
    ...dsl,
    from: newFrom,
    ...(mergedFilter !== undefined ? { filter: mergedFilter } : {}),
  };
};

export const applyScope = (dsl: Query, entities: Set<string>, policy: ScopePolicy): Query => {
  // Access check over every entity discovered in the WHOLE tree — a denied
  // entity anywhere denies the query, wherever it hides. The returned
  // filters are discarded here; filters attach per level below.
  for (const entity of entities) {
    readFiltersFor(entity, policy.entities[entity], policy.default);
  }

  return applyScopeLevel(dsl, policy);
};
