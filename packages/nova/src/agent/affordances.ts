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
      if (key !== undefined && !scope.has(key)) boundKeys.add(key);
    }
    for (const match of value.matchAll(VAR_PATTERN)) {
      const name = match[1];
      if (name !== undefined && !scope.has(name)) suspects.add(`$${name}.`);
    }
  };

  // A ref a component dispatches from inside its props, at any depth: a Table's `rowRef`, a menu item's `ref`.
  const refsIn = (value: unknown, path: string, component: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => refsIn(item, `${path}${index}.`, component));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if ((key === 'ref' || key.endsWith('Ref')) && typeof inner === 'string' && inner.length > 0) refs.push({ ref: inner, component, via: `${path}${key}` });
      else refsIn(inner, `${path}${key}.`, component);
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
    // The renderer binds the loop variable, `index` and `items` under the data root inside a loop.
    const childScope = loopVar !== undefined ? new Set([...scope, loopVar, 'index', 'items']) : scope;

    const component = typeof record['component'] === 'string' ? record['component'] : undefined;
    if (component !== undefined) {
      componentCount += 1;
      if (typeof record['ref'] === 'string' && record['ref'].length > 0) {
        refs.push({ ref: record['ref'], component, via: 'ref' });
      }
      if (typeof record['model'] === 'string' && record['model'].length > 0) {
        models.push({ path: record['model'], component });
      }
      refsIn(record['props'], '', component);
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
