// ═══════════════════════════════════════════════════════════
// resolvePath — dot-path traversal on unknown objects
// ═══════════════════════════════════════════════════════════
//
// Resolves "a.b.c" against a root object. Returns undefined
// for any null/undefined/non-object segment. Used by the
// condition evaluator and the accumulator field extractor.

export const resolvePath = (root: unknown, path: string): unknown => {
  const segments = path.split('.');
  let current: unknown = root;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
};
