export const DOCUMENT_DEPTH_LIMIT = 256;

export const exceedsDepth = (value: unknown, limit: number = DOCUMENT_DEPTH_LIMIT): boolean => {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (typeof next.value !== 'object' || next.value === null) continue;
    const depth = next.depth + 1;
    if (depth > limit) return true;
    for (const inner of Array.isArray(next.value) ? next.value : Object.values(next.value)) pending.push({ value: inner, depth });
  }
  return false;
};

export const depthRefusal = (limit: number = DOCUMENT_DEPTH_LIMIT): string =>
  `the document nests deeper than ${limit} levels — no document is written that deep, and a schema reading one would overflow the stack`;
