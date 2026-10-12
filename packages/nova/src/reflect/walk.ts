export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const walkNodes = (value: unknown, visit: (record: Record<string, unknown>) => void): void => {
  if (Array.isArray(value)) {
    for (const item of value) walkNodes(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  for (const inner of Object.values(value)) walkNodes(inner, visit);
};

export const componentsOf = (value: unknown): Set<string> => {
  const out = new Set<string>();
  walkNodes(value, (record) => {
    if (typeof record['component'] === 'string') out.add(record['component']);
  });
  return out;
};

// Only the refs inside a component's props (a Table's `rowRef`, a cell's
// `ref`), not a node's own `ref`.
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

export const loopVarsOf = (value: unknown): Set<string> => {
  const out = new Set<string>();
  walkNodes(value, (record) => {
    if (typeof record['as'] === 'string' && record['for'] !== undefined) out.add(record['as']);
  });
  return out;
};
