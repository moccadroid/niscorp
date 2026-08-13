import type { Query, Source } from '../schemas/query.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import { VexError } from '../errors.js';

// ═══════════════════════════════════════════════════════════════
// OPTIONAL CONDITIONS — resolved BEFORE the pipeline, never inside it.
//
// `{ optional: { key, then } }` is the one thing a caller can do to the SHAPE
// of a query rather than to its values: supply the key and the condition is
// there, omit it and the condition is gone. That is what makes one entry able
// to answer "everybody", "everybody matching a search", and "one person by id"
// — questions that were three entries because every `$context` ref was
// mandatory (`executor.ts` findMissingContext).
//
// It is a DSL→DSL rewrite, run at the same point as `applySortContext`, and
// that placement is the whole safety argument. The resolver, the compiler and
// the scope walker never see this node. They cannot: by the time any of them
// runs, every optional has already become either its condition or nothing at
// all. So there is no third walker to teach, and — crucially — no way for an
// entity to enter the query AFTER `discoverEntities` has decided what to scope.
// All three throw if they ever meet one, so a future caller that reaches past
// this pass gets an error rather than an unscoped read.
//
// WHAT IS DELIBERATELY NOT DONE HERE: the joins stay. `from` is untouched when
// a condition drops, so which keys a caller sends can never change the row
// multiplicity of the result — only how many rows survive the WHERE. A pruned
// query is the same query with fewer conditions, never a differently-shaped one.
// ═══════════════════════════════════════════════════════════════

/** The keys one optional gate names — one, or all of several. A condition that
 *  reads two context values depends on BOTH, and gating it on one would leave
 *  the other conditionally required: supply `after` without `afterId` and the
 *  clause survives with a hole in it, which surfaces as an empty result and
 *  `missingContext`, not as a condition that quietly did not apply. On a paging
 *  cursor an empty result reads as "end of list", which is the wrong answer
 *  arrived at silently. */
const gateKeys = (key: string | string[]): string[] => (Array.isArray(key) ? key : [key]);

/** Every optional key mentioned anywhere in a query, in declaration order. */
export const optionalKeysOf = (dsl: Query): string[] => {
  const keys: string[] = [];
  const walk = (filter: Filter): void => {
    if ('optional' in filter) {
      for (const key of gateKeys(filter.optional.key)) {
        if (!keys.includes(key)) keys.push(key);
      }
      walk(filter.optional.then);
      return;
    }
    if ('and' in filter) { for (const sub of filter.and) walk(sub); return; }
    if ('or' in filter) { for (const sub of filter.or) walk(sub); return; }
    if ('not' in filter) { walk(filter.not); return; }
  };
  if (dsl.filter !== undefined) walk(dsl.filter);
  for (const source of dsl.from) {
    if (typeof source !== 'string') keys.push(...optionalKeysOf(source.query).filter((k) => !keys.includes(k)));
  }
  return keys;
};

/** Which context keys the caller actually supplied.
 *
 *  ABSENT MEANS MISSING, `undefined`, OR `null`. The empty string is a value —
 *  searching for `''` is a real search — but null is not, for two reasons that
 *  agree:
 *
 *  · SQL. A bound null in a comparison can never match: `col = NULL` and
 *    `col ILIKE NULL` are both NULL, never true. So "send null" could only ever
 *    have meant "I have nothing", and vex already has `isNull`/`isNotNull` for
 *    the question people actually mean by it. Nothing is lost.
 *
 *  · The wire. JSON has no `undefined`, and a request prism assembles a fixed
 *    object — it cannot conditionally omit a key. Without null counting as
 *    absent, every caller with an empty search box would have to bind a
 *    sentinel again, which is the exact thing this feature removes.
 *
 *  This is deliberately WIDER than `findMissingContext`'s test, which stays on
 *  `undefined` alone. A required key sent as null still binds null and matches
 *  nothing; an optional key sent as null drops its condition. That reads like a
 *  contradiction and is not: the author chose which keys are optional, and for
 *  those they have already said absence means "this does not apply". A caller
 *  gains nothing by it either — omitting the key does the same thing, and scope
 *  is injected after this either way. */
export const presenceOf = (context: Record<string, unknown>): ReadonlySet<string> => {
  const present = new Set<string>();
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined && value !== null) present.add(key);
  }
  return present;
};

/** A stable name for "which optionals were live on this run" — used to report
 *  how many distinct shapes one entry is being asked for. `all` is the compile
 *  and test path, where there is no caller. */
export const presenceSignature = (dsl: Query, present: ReadonlySet<string> | 'all'): string => {
  const keys = optionalKeysOf(dsl);
  if (keys.length === 0) return '';
  if (present === 'all') return keys.join(',');
  return keys.filter((k) => present.has(k)).join(',');
};

// `undefined` means THIS NODE IS GONE — not "false", not "true". The caller of
// each recursion decides what its absence means in context, which is the only
// way `and` (identity true) and `or` (identity false) can both be correct.
const prune = (filter: Filter, present: ReadonlySet<string> | 'all', insideExists: boolean): Filter | undefined => {
  if ('optional' in filter) {
    // The correlation of an EXISTS is what ties it to the outer row. Let a
    // caller switch that off and `exists` stops asking "is there one of these
    // for THIS row" and starts asking "is there one of these at all" — a
    // different question that happens to be true far more often. Refused
    // outright rather than defended per-case.
    const keys = gateKeys(filter.optional.key);
    if (insideExists) {
      throw new VexError('invalid_dsl', `An optional condition ("${keys.join(', ')}") cannot live inside an exists — its correlation must hold on every run.`);
    }
    // ALL of them, not any: a condition needing two values and given one is a
    // condition that cannot run.
    if (present !== 'all' && !keys.every((key) => present.has(key))) return undefined;
    return prune(filter.optional.then, present, insideExists);
  }

  if ('exists' in filter) {
    const inner = filter.exists.filter === undefined ? undefined : prune(filter.exists.filter, present, true);
    return inner === undefined
      ? { exists: { from: filter.exists.from } }
      : { exists: { from: filter.exists.from, filter: inner } };
  }

  if ('and' in filter || 'or' in filter) {
    const isAnd = 'and' in filter;
    const kept = (isAnd ? filter.and : filter.or)
      .map((sub) => prune(sub, present, insideExists))
      .filter((sub): sub is Filter => sub !== undefined);
    // The schema requires two arms, so a pruned pair has to collapse rather
    // than emit a one-armed `and` that would fail its own validation.
    if (kept.length === 0) return undefined;
    if (kept.length === 1) return kept[0];
    return isAnd ? { and: kept } : { or: kept };
  }

  if ('not' in filter) {
    const inner = prune(filter.not, present, insideExists);
    // `not` of a condition that is not there is not "true" or "false" — it is
    // a question nobody asked. An author who wants "exclude these when the key
    // is given" writes `{ optional: { key, then: { not: … } } }`, which says it.
    if (inner === undefined) {
      throw new VexError('invalid_dsl', 'An optional condition cannot be the whole body of a `not` — wrap the `not` in the optional instead.');
    }
    return { not: inner };
  }

  return filter;
};

/** Resolve every optional condition against the keys a caller supplied.
 *
 *  A query whose filter prunes away entirely comes back with NO filter, which
 *  is the point: `people/list` with no lens, no search and no cursor is the
 *  whole roll, and it says so by having nothing to say. Scope is injected
 *  after this, so "no filter" still never means "every tenant". */
export const pruneOptional = (dsl: Query, present: ReadonlySet<string> | 'all'): Query => {
  const from: Source[] = dsl.from.map((source) =>
    typeof source === 'string' ? source : { as: source.as, query: pruneOptional(source.query, present) },
  );

  if (dsl.filter === undefined) return { ...dsl, from };

  const filter = prune(dsl.filter, present, false);
  if (filter === undefined) {
    const { filter: _dropped, ...rest } = dsl;
    return { ...rest, from };
  }
  return { ...dsl, from, filter };
};

/** Belt and braces for the three walkers that must never meet this node. */
export const refuseOptional = (where: string): never => {
  throw new VexError(
    'invalid_dsl',
    `An optional condition reached ${where}. It should have been resolved by pruneOptional before the pipeline ran — reaching this point means a query was compiled without knowing which context keys the caller supplied.`,
  );
};
