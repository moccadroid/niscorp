import type { Query } from '../schemas/query.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { ScopePolicy, ScopeEntityRule, ScopeFilterRule } from './scope.types.js';

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

const isPublicRule = (rule: ScopeEntityRule): rule is { public: true } =>
  typeof rule === 'object' && !Array.isArray(rule) && 'public' in rule && rule.public === true;

const isDenyRule = (rule: ScopeEntityRule): rule is { deny: true } =>
  typeof rule === 'object' && !Array.isArray(rule) && 'deny' in rule && rule.deny === true;

const buildFilterForRule = (entity: string, rule: ScopeFilterRule): Filter => {
  const fieldPath = `${entity}.${rule.field}`;
  const scopeRef = { $scope: rule.source };
  const op = rule.op ?? 'eq';

  if (op === 'eq') {
    return { eq: [fieldPath, scopeRef] };
  }
  if (op === 'neq') {
    return { neq: [fieldPath, scopeRef] };
  }
  // op === 'in'
  return { in: [fieldPath, scopeRef] };
};

const buildScopeFilters = (entity: string, rule: ScopeFilterRule | ScopeFilterRule[]): Filter[] => {
  if (Array.isArray(rule)) {
    return rule.map((r) => buildFilterForRule(entity, r));
  }
  return [buildFilterForRule(entity, rule)];
};

const andMerge = (existing: Filter | undefined, additions: Filter[]): Filter | undefined => {
  if (additions.length === 0) return existing;

  const allFilters: Filter[] = [];

  if (existing !== undefined) {
    allFilters.push(existing);
  }

  allFilters.push(...additions);

  if (allFilters.length === 1) {
    const single = allFilters[0];
    return single !== undefined ? single : undefined;
  }

  return { and: allFilters };
};

// ───────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────

export const applyScope = (dsl: Query, entities: Set<string>, policy: ScopePolicy): Query => {
  const scopeFilters: Filter[] = [];

  for (const entity of entities) {
    const rule: ScopeEntityRule | undefined = policy.entities[entity];

    if (rule === undefined) {
      // No rule — use default
      if (policy.default === 'deny') {
        throw new VexScopeError(entity, `Entity "${entity}" is not allowed by scope policy (default: deny)`);
      }
      // default: allow — skip
      continue;
    }

    if (isPublicRule(rule)) {
      continue;
    }

    if (isDenyRule(rule)) {
      throw new VexScopeError(entity, `Entity "${entity}" is denied by scope policy`);
    }

    // ScopeFilterRule or ScopeFilterRule[]
    scopeFilters.push(...buildScopeFilters(entity, rule));
  }

  // Recurse into subquery sources
  const newFrom = dsl.from.map((source) => {
    if (typeof source === 'string') return source;
    return {
      as: source.as,
      query: applyScope(source.query, entities, policy),
    };
  });

  const mergedFilter = andMerge(dsl.filter, scopeFilters);

  return {
    ...dsl,
    from: newFrom,
    ...(mergedFilter !== undefined ? { filter: mergedFilter } : {}),
  };
};
