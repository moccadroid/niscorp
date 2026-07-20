// ═══════════════════════════════════════════════════════════
// The one traversal the codebase kept re-writing. A nova artifact — a layout,
// a render tree, a definition, a whole manifest — is nested plain objects and
// arrays; walking it to collect or check "every node that has X" was
// hand-rolled in moss (collectComponents, hasVisibleContent) and relay's
// devtools (walk, collectLoopVars, collectPropRefs). This is that walk, once,
// plus the collectors that ride it.
//
// This is the STRUCTURAL walk — it visits every plain-object record. The
// SEMANTIC walkers (collectChannels, which follows call→onSuccess; the typed
// RenderNode model-binding walk) stay their own thing: folding them onto a
// blind structural walk would lose their precision.
// ═══════════════════════════════════════════════════════════

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Visit every plain-object record in a nova tree, arrays and nested objects
// included. The visitor sees each record before its children.
export const walkNodes = (value: unknown, visit: (record: Record<string, unknown>) => void): void => {
  if (Array.isArray(value)) {
    for (const item of value) walkNodes(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  for (const inner of Object.values(value)) walkNodes(inner, visit);
};

// Every component NAME referenced anywhere in a tree — layouts, render trees,
// fragments, a manifest. (Was moss's `collectComponents`.)
export const componentsOf = (value: unknown): Set<string> => {
  const out = new Set<string>();
  walkNodes(value, (record) => {
    if (typeof record['component'] === 'string') out.add(record['component']);
  });
  return out;
};

// Every ref carried by a `ref` / `*Ref` key INSIDE a component's props — the
// refs a component dispatches for (a Table's rowRef, a cell's ref), which
// node-level `ref:` analysis doesn't see. (Was devtools' `collectPropRefs`.)
export const refsOf = (value: unknown): Set<string> => {
  const out = new Set<string>();
  walkNodes(value, (record) => {
    if (record['component'] === undefined || !isRecord(record['props'])) return;
    walkNodes(record['props'], (props) => {
      for (const [key, propValue] of Object.entries(props)) {
        if ((key === 'ref' || key.endsWith('Ref')) && typeof propValue === 'string' && propValue !== '') out.add(propValue);
      }
    });
  });
  return out;
};

// Every loop `as:` variable declared anywhere in a layout — the names that are
// in scope at runtime inside a `for`. (Was devtools' `collectLoopVars`.)
export const loopVarsOf = (value: unknown): Set<string> => {
  const out = new Set<string>();
  walkNodes(value, (record) => {
    if (typeof record['as'] === 'string' && record['for'] !== undefined) out.add(record['as']);
  });
  return out;
};
