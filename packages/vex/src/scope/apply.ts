import type { Query } from '../schemas/query.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { ResolvedQuery, ResolvedFilter, ResolvedSource, ResolvedJoin } from '../engine/engine.types.js';
import type { ScopePolicy, ScopeEntityRule, ScopeMatch } from './scope.types.js';
import { VexError } from '../errors.js';

// ───────────────────────────────────────────────────────────────
// Error
// ───────────────────────────────────────────────────────────────

// A scope denial IS a VexError (code 'scope_denied') so the HTTP layer maps
// it to a 400 like every other request error — a denied read or write is the
// caller's problem, not a 500. `entity` is kept for callers that inspect it.
export class VexScopeError extends VexError {
  readonly entity: string;

  constructor(entity: string, message: string) {
    super('scope_denied', message);
    this.name = 'VexScopeError';
    this.entity = entity;
  }
}

// ───────────────────────────────────────────────────────────────
// TWO QUESTIONS, DELIBERATELY SEPARATED
// ───────────────────────────────────────────────────────────────
//
// Scope answers two things that used to be answered in one pass, and
// conflating them produced a silent, universal row-loss bug:
//
//   1. MAY this caller touch this table at all?  — a pure allow/deny over
//      entity names. Needs no schema, no aliases, no joins. Runs before
//      resolution, over every entity discovered anywhere in the tree.
//
//   2. WHERE does the row rule go?  — needs to know HOW the table is reached,
//      because a row rule on a LEFT-joined table belongs in that join's ON
//      clause. It used to be merged into the DSL's `filter`, which compiles to
//      WHERE, which turns every LEFT join into an INNER one: a driving row
//      whose optional FK is null gets null-padded columns, `null = $tenant` is
//      null rather than true, and the row vanishes. No error, no warning, a
//      shorter list. It hid for as long as no data had a null FK.
//
// Only the resolver knows join kinds, so (2) moved after resolution. That also
// means scope no longer writes anything into the authored `Query` — the
// document integrations ship over the wire carries no engine-trusted field,
// which is a property worth having on its own.

const matchesFor = (entity: string, rule: ScopeEntityRule | undefined, def: 'allow' | 'deny'): ScopeMatch[] => {
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
  return rule.read;
};

// ───────────────────────────────────────────────────────────────
// 1. May they touch it
// ───────────────────────────────────────────────────────────────

// Throws on the first denied entity. A denied entity ANYWHERE denies the query,
// including inside a subquery or an `exists` — `discoverEntities` walks the
// whole tree, so a table cannot be reached by hiding it one level down.
export const checkScope = (entities: Set<string>, policy: ScopePolicy): void => {
  for (const entity of entities) matchesFor(entity, policy.entities[entity], policy.default);
};

// ───────────────────────────────────────────────────────────────
// 2. Where the row rule goes
// ───────────────────────────────────────────────────────────────

const andMerge = (existing: ResolvedFilter | undefined, additions: ResolvedFilter[]): ResolvedFilter | undefined => {
  if (additions.length === 0) return existing;
  const all = existing === undefined ? additions : [existing, ...additions];
  if (all.length === 1) return all[0];

  const paths = new Map<string, { alias: string; column: string; schema: never }>();
  for (const part of all) for (const [key, value] of part.resolvedPaths) paths.set(key, value as never);
  return { original: { and: all.map((f) => f.original) }, resolvedPaths: paths as never };
};

// One row rule, resolved against the alias the table actually got.
const predicateFor = (
  entityName: string,
  alias: string,
  match: ScopeMatch,
  fields: { name: string; nullable: boolean }[],
): ResolvedFilter | undefined => {
  const field = fields.find((f) => f.name === match.match);
  // A rule naming a column the table does not have is a policy bug, not a
  // request bug — but failing the read closed is the only safe reading of it.
  if (field === undefined) throw new VexScopeError(entityName, `Scope rule for "${entityName}" names column "${match.match}", which the table does not have`);
  const path = `${entityName}.${match.match}`;
  const original: Filter = { eq: [path, { $scope: match.to }] };
  return { original, resolvedPaths: new Map([[path, { alias, column: match.match, schema: field as never }]]) as never };
};

// One LEVEL of a resolved tree — an outer query, a subquery, or an `exists`.
// They differ in what else they carry; for placing row rules they are the same
// four things, so they get the same code and cannot drift apart.
type ScopeLevel = {
  sources: ResolvedSource[];
  joins: ResolvedJoin[];
  aliasMap: Map<string, string>;
  filter?: ResolvedFilter;
};

const placeInto = (level: ScopeLevel, policy: ScopePolicy): void => {
  const whereAdditions: ResolvedFilter[] = [];

  for (const source of level.sources) {
    const entity = source.entity;
    if (entity === undefined) continue;

    const join = level.joins.find((j) => j.toAlias === source.alias);
    for (const match of matchesFor(entity.name, policy.entities[entity.name], policy.default)) {
      const predicate = predicateFor(entity.name, source.alias, match, entity.fields);
      if (predicate === undefined) continue;

      // The compiler resolves `entity.column` through the alias map, and these
      // predicates never went through the resolver's field pass, so they say
      // where they point.
      level.aliasMap.set(`${entity.name}.${match.match}`, `${source.alias}.${match.match}`);

      if (join !== undefined && join.kind === 'left') join.on = [...(join.on ?? []), predicate];
      else whereAdditions.push(predicate);
    }
  }

  const merged = andMerge(level.filter, whereAdditions);
  if (merged !== undefined) level.filter = merged;
};

// Walk the resolved tree and place every row rule. Subqueries and `exists`
// nodes recurse: a rule on `tasks` lands inside the level whose FROM actually
// reads tasks, never on an outer query that only sees an alias.
//
// The `exists` recursion is not tidiness — it is the boundary. An EXISTS
// returns a boolean, but a boolean about somebody else's rows is still an
// answer about somebody else's rows: an uncorrelated `exists` over a scoped
// table would report whether ANY tenant has such a row. Access-checking the
// table is not enough; the rule has to be inside the subquery too.
export const scopeResolved = (resolved: ResolvedQuery, policy: ScopePolicy): ResolvedQuery => {
  for (const source of resolved.sources) {
    if (source.subquery !== undefined) scopeResolved(source.subquery, policy);
  }

  // Every `exists` at every depth — the resolver collects nested ones into the
  // same flat map, so one pass covers the tree.
  for (const node of resolved.existsMap?.values() ?? []) {
    placeInto(node, policy);
  }

  placeInto(resolved, policy);
  return resolved;
};

// ───────────────────────────────────────────────────────────────
// Deprecated shape, kept so a caller that only wanted the access check still
// gets one. It no longer returns a filtered DSL, because scope is not a DSL
// concern any more — `scopeResolved` does the placing.
// ───────────────────────────────────────────────────────────────
export const applyScope = (dsl: Query, entities: Set<string>, policy: ScopePolicy): Query => {
  checkScope(entities, policy);
  return dsl;
};
