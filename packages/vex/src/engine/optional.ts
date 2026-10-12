import type { Query, Source } from '../schemas/query.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import { VexError } from '../errors.js';

const gateKeys = (key: string | string[]): string[] => (Array.isArray(key) ? key : [key]);

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

/** null counts as absent, wider than `findMissingContext`'s `undefined`: JSON
 *  has no `undefined`, and a bound null never matches in a comparison anyway.
 *  The empty string is a value. */
export const presenceOf = (context: Record<string, unknown>): ReadonlySet<string> => {
  const present = new Set<string>();
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined && value !== null) present.add(key);
  }
  return present;
};

export const presenceSignature = (dsl: Query, present: ReadonlySet<string> | 'all'): string => {
  const keys = optionalKeysOf(dsl);
  if (keys.length === 0) return '';
  if (present === 'all') return keys.join(',');
  return keys.filter((k) => present.has(k)).join(',');
};

const prune = (filter: Filter, present: ReadonlySet<string> | 'all', insideExists: boolean): Filter | undefined => {
  if ('optional' in filter) {
    const keys = gateKeys(filter.optional.key);
    if (insideExists) {
      throw new VexError('invalid_dsl', `An optional condition ("${keys.join(', ')}") cannot live inside an exists — its correlation must hold on every run.`);
    }
    // Every key, not any: given one of two, the condition would stay with a
    // hole in it and the read would answer empty.
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
    if (kept.length === 0) return undefined;
    if (kept.length === 1) return kept[0];
    return isAnd ? { and: kept } : { or: kept };
  }

  if ('not' in filter) {
    const inner = prune(filter.not, present, insideExists);
    if (inner === undefined) {
      throw new VexError('invalid_dsl', 'An optional condition cannot be the whole body of a `not` — wrap the `not` in the optional instead.');
    }
    return { not: inner };
  }

  return filter;
};

/** Scope is injected after this, so a filter pruned away entirely still never
 *  means every tenant. */
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

/** The resolver, the compiler and scope discovery call this: with every
 *  optional pruned first, no entity enters a query after scope was decided. */
export const refuseOptional = (where: string): never => {
  throw new VexError(
    'invalid_dsl',
    `An optional condition reached ${where}. It should have been resolved by pruneOptional before the pipeline ran — reaching this point means a query was compiled without knowing which context keys the caller supplied.`,
  );
};
