import type { ResolvedQuery } from '../../engine/engine.types.js';
import type { CompiledQuery, ParamSlot, ContextContract } from '../adapter.types.js';
import { compileFilter, compileCompute, compileAggregate, compileJoinPairs, quoteIdent } from './operators.js';
import { VexError } from '../../errors.js';
import type { CompilationContext } from './operators.js';

export const compileQuery = (resolved: ResolvedQuery): CompiledQuery => {
  const paramSlots: ParamSlot[] = [];
  const paramCounter = { value: 0 };

  const ctx: CompilationContext = {
    resolvedPaths: resolved.filter?.resolvedPaths ?? new Map(),
    aliasMap: resolved.aliasMap,
    paramSlots,
    paramCounter,
    ...(resolved.existsMap !== undefined ? { existsMap: resolved.existsMap } : {}),
  };

  const sqlParts: string[] = [];

  const selectParts: string[] = [];

  if (resolved.distinct) {
    selectParts.push('DISTINCT');
  }

  const fieldColumns = resolved.fields.map((f) =>
    `${f.alias}.${f.column} AS ${quoteIdent(f.outputName)}`,
  );

  const computeColumns = resolved.computes.map((c) => {
    const expr = compileCompute(c.expression, ctx);
    return `${expr} AS ${quoteIdent(c.name)}`;
  });

  const aggregateColumns = resolved.aggregates.map((a) => {
    const expr = compileAggregate(a.expression, ctx);
    return `${expr} AS ${quoteIdent(a.name)}`;
  });

  const allColumns = [...fieldColumns, ...computeColumns, ...aggregateColumns];
  if (selectParts.length > 0) {
    sqlParts.push(`SELECT ${selectParts.join(' ')} ${allColumns.join(', ')}`);
  } else {
    sqlParts.push(`SELECT ${allColumns.join(', ')}`);
  }

  const firstSource = resolved.sources[0];
  if (firstSource !== undefined) {
    if (firstSource.subquery !== undefined) {
      const subSql = compileQuery(firstSource.subquery);
      mergeSubqueryParams(subSql, paramSlots, paramCounter);
      sqlParts.push(`FROM (${subSql.sql}) AS ${firstSource.alias}`);
    } else if (firstSource.table !== undefined) {
      sqlParts.push(`FROM ${firstSource.table} AS ${firstSource.alias}`);
    }
  }

  for (const join of resolved.joins) {
    const joinSource = resolved.sources.find((s) => s.alias === join.toAlias);
    if (joinSource !== undefined) {
      const keyword = join.kind === 'left' ? 'LEFT JOIN' : 'JOIN';
      const conditions = [
        ...compileJoinPairs(join),
        ...(join.on ?? []).map((extra) => compileFilter(extra.original, ctx)),
      ];
      const on = conditions.join(' AND ');
      if (joinSource.subquery !== undefined) {
        const subSql = compileQuery(joinSource.subquery);
        mergeSubqueryParams(subSql, paramSlots, paramCounter);
        sqlParts.push(`${keyword} (${subSql.sql}) AS ${join.toAlias} ON ${on}`);
      } else {
        sqlParts.push(`${keyword} ${join.toTable} AS ${join.toAlias} ON ${on}`);
      }
    }
  }

  // The cartesian product is intended: an entity source always gets an FK join
  // or the resolver throws, so only subquery sources land here.
  const joinedAliases = new Set(resolved.joins.map((j) => j.toAlias));
  for (const source of resolved.sources) {
    if (source.alias === firstSource?.alias || joinedAliases.has(source.alias)) continue;
    if (source.subquery !== undefined) {
      const subSql = compileQuery(source.subquery);
      mergeSubqueryParams(subSql, paramSlots, paramCounter);
      sqlParts.push(`CROSS JOIN (${subSql.sql}) AS ${source.alias}`);
    } else if (source.table !== undefined) {
      sqlParts.push(`CROSS JOIN ${source.table} AS ${source.alias}`);
    }
  }

  if (resolved.filter !== undefined) {
    const whereClause = compileFilter(resolved.filter.original, ctx);
    sqlParts.push(`WHERE ${whereClause}`);
  }

  if (resolved.groupBy.length > 0) {
    const groupByParts = resolved.groupBy.map((f) => `${f.alias}.${f.column}`);
    sqlParts.push(`GROUP BY ${groupByParts.join(', ')}`);
  }

  if (resolved.sort.length > 0) {
    const orderByParts = resolved.sort.map((s) => {
      if (typeof s.field === 'string') {
        return `${quoteIdent(s.field)} ${s.dir === 'desc' ? 'DESC' : 'ASC'}`;
      }
      return `${s.field.alias}.${s.field.column} ${s.dir === 'desc' ? 'DESC' : 'ASC'}`;
    });
    sqlParts.push(`ORDER BY ${orderByParts.join(', ')}`);
  } else if (resolved.semantic !== undefined) {
    const semanticIdx = findSemanticParamIndex(paramSlots);
    if (semanticIdx !== undefined) {
      const col = `${resolved.semantic.field.alias}.${resolved.semantic.field.column}`;
      sqlParts.push(`ORDER BY ${col} <=> $${semanticIdx} ASC`);
    }
  }

  if (resolved.limit !== undefined) {
    // The schema says a positive integer; a DSL that skipped the schema is held
    // to it here, because this is text, not a parameter.
    if (!Number.isInteger(resolved.limit) || resolved.limit < 1) {
      throw new VexError('invalid_dsl', `LIMIT must be a positive integer, not ${String(resolved.limit)}.`);
    }
    sqlParts.push(`LIMIT ${resolved.limit}`);
  }

  const contextContract: ContextContract = {};
  for (const slot of paramSlots) {
    contextContract[slot.key] = { type: slot.type, kind: slot.kind };
  }

  return {
    sql: sqlParts.join(' '),
    paramSlots,
    contextContract,
  };
};

const findSemanticParamIndex = (slots: ParamSlot[]): number | undefined => {
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot !== undefined && slot.kind === 'semantic') {
      return i + 1;
    }
  }
  return undefined;
};

const mergeSubqueryParams = (
  subCompiled: CompiledQuery,
  parentSlots: ParamSlot[],
  parentCounter: { value: number },
): void => {
  // The subquery's SQL keeps its own `$N`, counted from $1: they are not
  // rewritten, so they match these slots only while no slot precedes them.
  for (const slot of subCompiled.paramSlots) {
    parentCounter.value += 1;
    parentSlots.push(slot);
  }
};
