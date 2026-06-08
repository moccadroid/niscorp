import type {
  ResolvedQuery,
  ResolvedSource,
  AnalysisResult,
  AnalysisConfig,
} from './engine.types.js';

// ═══════════════════════════════════════════════════════════════
// Nesting depth
// ═══════════════════════════════════════════════════════════════

const measureNestingDepth = (source: ResolvedSource): number => {
  if (source.subquery === undefined) return 0;
  let maxChild = 0;
  for (const childSource of source.subquery.sources) {
    const childDepth = measureNestingDepth(childSource);
    if (childDepth > maxChild) maxChild = childDepth;
  }
  return 1 + maxChild;
};

const getMaxNestingDepth = (resolved: ResolvedQuery): number => {
  let max = 0;
  for (const source of resolved.sources) {
    const depth = measureNestingDepth(source);
    if (depth > max) max = depth;
  }
  return max;
};

// ═══════════════════════════════════════════════════════════════
// Cartesian product detection
// ═══════════════════════════════════════════════════════════════

const hasCartesianProduct = (resolved: ResolvedQuery): boolean => {
  // Only relevant when there are multiple entity sources (not subqueries)
  const entitySources = resolved.sources.filter((s) => s.entity !== undefined);
  if (entitySources.length <= 1) return false;

  // Check that each source after the first has at least one join connecting it
  // to a previously-seen source
  const seenAliases = new Set<string>();
  const firstSource = entitySources[0];
  if (firstSource !== undefined) {
    seenAliases.add(firstSource.alias);
  }

  for (let i = 1; i < entitySources.length; i++) {
    const source = entitySources[i];
    if (source === undefined) continue;

    const hasJoin = resolved.joins.some(
      (j) =>
        (j.toAlias === source.alias && seenAliases.has(j.fromAlias)) ||
        (j.fromAlias === source.alias && seenAliases.has(j.toAlias)),
    );

    if (!hasJoin) return true;

    seenAliases.add(source.alias);
  }

  return false;
};

// ═══════════════════════════════════════════════════════════════
// Unindexed filter check
// ═══════════════════════════════════════════════════════════════

const findUnindexedFilterColumns = (resolved: ResolvedQuery): string[] => {
  if (resolved.filter === undefined) return [];

  const unindexed: string[] = [];

  for (const [path, res] of resolved.filter.resolvedPaths) {
    // Find the entity for this alias
    const source = resolved.sources.find((s) => s.alias === res.alias);
    if (source === undefined || source.entity === undefined) continue;

    // Check if the column appears in any index
    const isIndexed = source.entity.indexes.some((idx) =>
      idx.fields.includes(res.column),
    );

    // Also consider primary keys as indexed
    const isPrimaryKey = source.entity.fields.some(
      (f) => f.name === res.column && f.primaryKey,
    );

    if (!isIndexed && !isPrimaryKey) {
      unindexed.push(path);
    }
  }

  return unindexed;
};

// ═══════════════════════════════════════════════════════════════
// Aggregates without groupBy
// ═══════════════════════════════════════════════════════════════

const hasAggregatesWithoutGroupBy = (resolved: ResolvedQuery): boolean =>
  resolved.aggregates.length > 0 && resolved.groupBy.length === 0;

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

export const analyze = (resolved: ResolvedQuery, config: AnalysisConfig): AnalysisResult => {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check nesting depth
  const depth = getMaxNestingDepth(resolved);
  if (depth > config.maxNestingDepth) {
    errors.push(
      `Subquery nesting depth ${depth} exceeds maximum allowed depth of ${config.maxNestingDepth}`,
    );
  }

  // Check for cartesian products
  if (config.rejectCartesianProducts && hasCartesianProduct(resolved)) {
    errors.push(
      'Cartesian product detected: multiple sources with no join between them. Add a join or reduce sources.',
    );
  }

  // Check for unindexed filter columns
  const unindexed = findUnindexedFilterColumns(resolved);
  if (unindexed.length > 0) {
    const message = `Unindexed filter columns: ${unindexed.join(', ')}. Consider adding indexes for better performance.`;
    if (config.rejectUnindexedFilters) {
      errors.push(message);
    } else if (config.warnUnindexedFilters) {
      warnings.push(message);
    }
  }

  // Check for aggregates without groupBy
  if (hasAggregatesWithoutGroupBy(resolved)) {
    warnings.push(
      'Aggregate functions used without groupBy. The result will be a single aggregated row.',
    );
  }

  // Check for unindexed vector field in semantic search
  if (resolved.semantic !== undefined) {
    const semanticField = resolved.semantic.field;
    const vectorSource = resolved.sources.find(
      (s) => s.alias === semanticField.alias,
    );
    if (vectorSource !== undefined && vectorSource.entity !== undefined) {
      const hasVectorIndex = vectorSource.entity.indexes.some(
        (idx) =>
          idx.fields.includes(semanticField.column) &&
          (idx.type === 'hnsw' || idx.type === 'ivfflat'),
      );
      if (!hasVectorIndex) {
        warnings.push(
          `Vector field "${semanticField.path}" has no HNSW or IVFFlat index. Semantic search may be slow.`,
        );
      }
    }
  }

  return { warnings, errors };
};
