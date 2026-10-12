export type InteractiveRef = {
  ref: string;
  component: string;
  via: string;
};

export type InteractiveModel = {
  path: string;
  component: string;
};

export type InteractiveSurface = {
  refs: InteractiveRef[];
  models: InteractiveModel[];
  boundKeys: string[];
  suspectBindings: string[];
  componentCount: number;
};

const KEY_PATTERN = /\$\.([A-Za-z_][A-Za-z0-9_]*)/g;
const VAR_PATTERN = /\$([A-Za-z_][A-Za-z0-9_]*)\./g;

export const collectInteractive = (layout: unknown): InteractiveSurface => {
  const refs: InteractiveRef[] = [];
  const models: InteractiveModel[] = [];
  const boundKeys = new Set<string>();
  const suspects = new Set<string>();
  let componentCount = 0;

  const scanString = (value: string, scope: ReadonlySet<string>): void => {
    for (const match of value.matchAll(KEY_PATTERN)) {
      const key = match[1];
      if (key !== undefined) boundKeys.add(key);
    }
    for (const match of value.matchAll(VAR_PATTERN)) {
      const name = match[1];
      if (name !== undefined && !scope.has(name)) suspects.add(`$${name}.`);
    }
  };

  const walk = (node: unknown, scope: ReadonlySet<string>): void => {
    if (typeof node === 'string') return scanString(node, scope);
    if (Array.isArray(node)) {
      for (const child of node) walk(child, scope);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;

    const loopVar = record['for'] !== undefined && typeof record['as'] === 'string' ? record['as'] : undefined;
    const childScope = loopVar !== undefined ? new Set([...scope, loopVar]) : scope;

    const component = typeof record['component'] === 'string' ? record['component'] : undefined;
    if (component !== undefined) {
      componentCount += 1;
      if (typeof record['ref'] === 'string' && record['ref'].length > 0) {
        refs.push({ ref: record['ref'], component, via: 'ref' });
      }
      if (typeof record['model'] === 'string' && record['model'].length > 0) {
        models.push({ path: record['model'], component });
      }
      const props = record['props'];
      if (props !== null && typeof props === 'object' && !Array.isArray(props)) {
        for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
          if (key.endsWith('Ref') && typeof value === 'string' && value.length > 0) {
            refs.push({ ref: value, component, via: key });
          }
        }
      }
    }
    for (const value of Object.values(record)) walk(value, childScope);
  };

  walk(layout, new Set());
  return {
    refs,
    models,
    boundKeys: [...boundKeys].sort(),
    suspectBindings: [...suspects].sort(),
    componentCount,
  };
};
