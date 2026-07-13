// ═══════════════════════════════════════════════════════════
// Affordance collection — the deterministic half of the action/layout seam.
//
// A layout's interactive surface is fully present in its tree: `ref` (event
// sources), `*Ref` props (component-specific event sources, e.g. a Table's
// sortRef), `model` (two-way input bindings), and every `$.key` binding it
// reads. A director agent that wires triggers against a layout it never sees
// needs that surface as data — so it is DERIVED here by walking the tree,
// never self-reported by the layout model. A receipt computed from the
// artifact cannot lie about the artifact.
// ═══════════════════════════════════════════════════════════

export type InteractiveRef = {
  ref: string;
  component: string;
  // How the ref is attached: the node's own `ref` field, or a `*Ref` prop name.
  via: string;
};

export type InteractiveModel = {
  // The bound data path, e.g. '$.search'.
  path: string;
  component: string;
};

export type InteractiveSurface = {
  refs: InteractiveRef[];
  models: InteractiveModel[];
  // Distinct top-level data keys the layout reads anywhere ('$.rows' → 'rows').
  boundKeys: string[];
  // Malformed-looking bindings: `$ident.…` where `ident` is neither the data
  // root (`$.`) nor a loop variable declared by an enclosing `for`/`as` —
  // e.g. `{{$kpi.count}}` (missing dot) renders literally and passes every
  // other check. Collected scope-aware so `{{$row.title}}` inside its loop
  // stays legal.
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

    // A `for` directive declares its loop variable for everything beneath.
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
    // Generic descent: directives (`if`/`for`), props, children, column cell
    // specs — every nested node and binding is reached without schema-specific
    // cases. Strings are scanned for `$.key` bindings on the way.
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
