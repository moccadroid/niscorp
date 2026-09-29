// ═══════════════════════════════════════════════════════════
// HOW DEEP A DOCUMENT MAY NEST, checked before a schema reads it. The
// grammars are recursive (a layout's children, a Prism `$if`, a Vex `and`),
// and a recursive schema recurses on the call stack: a document a few
// thousand levels deep does not come back from `safeParse` refused, it throws
// RangeError from inside the parser — at the one place meant to turn bad input
// into a refusal. So every boundary that parses a document from outside asks
// this first, and a document past the limit is refused like any other
// invalid one.
//
// 256 levels of JSON. The deepest document in the lab apps is 25 (relay's
// deal view: a layout's nodes, their props and bindings); a stranger's is
// either near that or not a document anybody wrote. The walk is iterative, so
// asking cannot overflow the stack either.
// ═══════════════════════════════════════════════════════════

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
