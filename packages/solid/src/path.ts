// ═══════════════════════════════════════════════════════════
// Path utilities — splitting, traversal, projection
// ═══════════════════════════════════════════════════════════

export const splitPath = (path: string): string[] => {
  if (path === '') return [];
  return path.split('.');
};

export const resolvePath = (base: string, relative: string): string => {
  if (base === '') return relative;
  if (relative === '') return base;
  return `${base}.${relative}`;
};

export const getByPath = (obj: unknown, segments: string[]): unknown => {
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0) return undefined;
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
};
