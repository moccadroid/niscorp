import type { ResolvedQuery } from '../../engine/engine.types.js';
import type { CompiledQuery, ParamSlot, ContextContract } from '../adapter.types.js';
import { compileFilter, compileCompute, compileAggregate } from './operators.js';
import type { CompilationContext } from './operators.js';

// ═══════════════════════════════════════════════════════════════
// Query compilation
// ═══════════════════════════════════════════════════════════════

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

  // ─── SELECT ────────────────────────────────────────────────
  const selectParts: string[] = [];

  if (resolved.distinct) {
    selectParts.push('DISTINCT');
  }

  // Regular fields
  const fieldColumns = resolved.fields.map((f) =>
    `${f.alias}.${f.column} AS "${f.outputName}"`,
  );

  // Computed fields
  const computeColumns = resolved.computes.map((c) => {
    const expr = compileCompute(c.expression, ctx);
    return `${expr} AS "${c.name}"`;
  });

  // Aggregate fields
  const aggregateColumns = resolved.aggregates.map((a) => {
    const expr = compileAggregate(a.expression, ctx);
    return `${expr} AS "${a.name}"`;
  });

  // Semantic score column
  const semanticColumns: string[] = [];
  if (resolved.semantic !== undefined) {
    const col = `${resolved.semantic.field.alias}.${resolved.semantic.field.column}`;

    // The semantic parameter was already added when compiling the filter
    // We need to add the score column using the same parameter reference
    // Find the semantic param slot index
    const semanticParamIndex = findSemanticParamIndex(paramSlots);
    if (semanticParamIndex !== undefined) {
      semanticColumns.push(`1 - (${col} <=> $${semanticParamIndex}) AS "$score"`);
    }
  }

  const allColumns = [...fieldColumns, ...computeColumns, ...aggregateColumns, ...semanticColumns];
  if (selectParts.length > 0) {
    sqlParts.push(`SELECT ${selectParts.join(' ')} ${allColumns.join(', ')}`);
  } else {
    sqlParts.push(`SELECT ${allColumns.join(', ')}`);
  }

  // ─── FROM ──────────────────────────────────────────────────
  const firstSource = resolved.sources[0];
  if (firstSource !== undefined) {
    if (firstSource.subquery !== undefined) {
      const subSql = compileQuery(firstSource.subquery);
      // Merge sub-params into our slots (offset positions)
      mergeSubqueryParams(subSql, paramSlots, paramCounter);
      sqlParts.push(`FROM (${subSql.sql}) AS ${firstSource.alias}`);
    } else if (firstSource.table !== undefined) {
      sqlParts.push(`FROM ${firstSource.table} AS ${firstSource.alias}`);
    }
  }

  // ─── JOIN ──────────────────────────────────────────────────
  // A join's ON clause is the FK condition plus anything scope put there. The
  // extras only ever appear on LEFT joins, and they are the whole reason a LEFT
  // join survives a row rule: in WHERE they would annihilate every driving row
  // whose optional FK is null.
  for (const join of resolved.joins) {
    const joinSource = resolved.sources.find((s) => s.alias === join.toAlias);
    if (joinSource !== undefined) {
      const keyword = join.kind === 'left' ? 'LEFT JOIN' : 'JOIN';
      const conditions = [
        `${join.fromAlias}.${join.fromColumn} = ${join.toAlias}.${join.toColumn}`,
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

  // ─── CROSS JOIN ────────────────────────────────────────────
  // Sources past the first with no join condition are cross-joined. A string
  // entity always gets an FK join (or the resolver throws), so in practice only
  // subquery sources land here — independent derived tables the author chose to
  // combine (e.g. four single-row COUNT aggregates → one row of counts). The
  // cartesian product is therefore intended, not an inferred mistake.
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

  // ─── WHERE ─────────────────────────────────────────────────
  if (resolved.filter !== undefined) {
    const whereClause = compileFilter(resolved.filter.original, ctx);
    sqlParts.push(`WHERE ${whereClause}`);
  }

  // ─── GROUP BY ──────────────────────────────────────────────
  if (resolved.groupBy.length > 0) {
    const groupByParts = resolved.groupBy.map((f) => `${f.alias}.${f.column}`);
    sqlParts.push(`GROUP BY ${groupByParts.join(', ')}`);
  }

  // ─── ORDER BY ──────────────────────────────────────────────
  if (resolved.sort.length > 0) {
    const orderByParts = resolved.sort.map((s) => {
      if (typeof s.field === 'string') {
        return `"${s.field}" ${s.dir.toUpperCase()}`;
      }
      return `${s.field.alias}.${s.field.column} ${s.dir.toUpperCase()}`;
    });
    sqlParts.push(`ORDER BY ${orderByParts.join(', ')}`);
  } else if (resolved.semantic !== undefined) {
    const semanticIdx = findSemanticParamIndex(paramSlots);
    if (semanticIdx !== undefined) {
      const col = `${resolved.semantic.field.alias}.${resolved.semantic.field.column}`;
      sqlParts.push(`ORDER BY ${col} <=> $${semanticIdx} ASC`);
    }
  }

  // ─── LIMIT ─────────────────────────────────────────────────
  if (resolved.limit !== undefined) {
    sqlParts.push(`LIMIT ${resolved.limit}`);
  }

  // ─── Build context contract ────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

const findSemanticParamIndex = (slots: ParamSlot[]): number | undefined => {
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot !== undefined && slot.kind === 'semantic') {
      return i + 1; // 1-indexed for $N references
    }
  }
  return undefined;
};

const mergeSubqueryParams = (
  subCompiled: CompiledQuery,
  parentSlots: ParamSlot[],
  parentCounter: { value: number },
): void => {
  // Subqueries have their own parameter numbering which we need to
  // offset when embedding in the parent query. For simplicity in this
  // implementation, subquery parameters are compiled independently.
  // A full implementation would rewrite $N references in the subquery SQL.
  // For now, subqueries that reference context/scope params work because
  // the executor resolves all params from all slots in order.
  for (const slot of subCompiled.paramSlots) {
    parentCounter.value += 1;
    parentSlots.push(slot);
  }
};
