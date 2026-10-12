import type { ActionDefinition } from '@niscorp/nova';

type Shape = { array: boolean; fields: Map<string, Shape> };

const shape = (): Shape => ({ array: false, fields: new Map() });

const child = (parent: Shape, key: string): Shape => {
  const held = parent.fields.get(key);
  if (held !== undefined) return held;
  const made = shape();
  parent.fields.set(key, made);
  return made;
};

const descend = (base: Shape, path: readonly string[]): Shape => {
  let at = base;
  for (const part of path) at = child(at, part);
  return at;
};

// `$.a.b` (root) and `$c.name` (inside a loop named c).
const BINDING = /\$([A-Za-z_]\w*)?\.([\w.]+)/g;

type Scope = Map<string, Shape>;

const partsOf = (raw: string): string[] => raw.split('.').filter((part) => part !== '');

const readBindings = (text: string, scope: Scope): void => {
  for (const match of text.matchAll(BINDING)) {
    const base = scope.get(match[1] ?? '');
    if (base === undefined) continue;
    const parts = partsOf(match[2] ?? '');
    if (parts.length === 0) continue;
    if (parts[parts.length - 1] === 'length') {
      descend(base, parts.slice(0, -1)).array = true;
      continue;
    }
    descend(base, parts);
  }
};

const aimedAt = (expr: string, scope: Scope): Shape | undefined => {
  const match = new RegExp(BINDING.source).exec(expr);
  if (match === null) return undefined;
  const base = scope.get(match[1] ?? '');
  if (base === undefined) return undefined;
  return descend(base, partsOf(match[2] ?? ''));
};

const CELL_KEYS = ['key', 'subKey', 'toneKey', 'iconKey'];

const collect = (node: unknown, scope: Scope): void => {
  if (typeof node === 'string') {
    readBindings(node, scope);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collect(item, scope);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;

  const loop = record['for'];
  if (typeof loop === 'string') {
    const target = aimedAt(loop, scope);
    if (target !== undefined) {
      target.array = true;
      const key = record['key'];
      if (typeof key === 'string' && key !== '') child(target, key);
      const inner: Scope = new Map(scope);
      inner.set(typeof record['as'] === 'string' ? record['as'] : 'item', target);
      collect(record['do'], inner);
      return;
    }
  }

  if (record['component'] === 'Rows') {
    const props = (record['props'] ?? {}) as Record<string, unknown>;
    const target = typeof props['rows'] === 'string' ? aimedAt(props['rows'], scope) : undefined;
    if (target !== undefined) {
      target.array = true;
      for (const column of Array.isArray(props['columns']) ? props['columns'] : []) {
        const cell = ((column as Record<string, unknown>)['cell'] ?? {}) as Record<string, unknown>;
        for (const name of CELL_KEYS) {
          const field = cell[name];
          if (typeof field === 'string' && field !== '') child(target, field);
        }
      }
    }
  }

  for (const value of Object.values(record)) collect(value, scope);
};

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.';
const TONES = ['neutral', 'accent', 'good', 'warn'];

const humanise = (key: string): string => {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const has = (key: string, ...needles: string[]): boolean => needles.some((needle) => key.includes(needle));

const valueFor = (key: string, index: number): unknown => {
  const name = key.toLowerCase();
  if (name === 'id' || name.endsWith('_id') || name.endsWith('id')) return `sample-${index + 1}`;
  if (name.endsWith('tone')) return TONES[index % TONES.length];
  if (name.endsWith('icon')) return 'dot';
  if (name.endsWith('_at') || has(name, 'date', 'arrival', 'departure', 'stamp', 'when')) return new Date().toISOString();
  if (has(name, 'count', 'total', 'amount', 'price', 'number', 'version', 'position', 'unread')) return index + 1;
  if (has(name, 'email')) return `sample${index + 1}@example.com`;
  if (has(name, 'url', 'service')) return `https://example.invalid/${index + 1}`;
  if (has(name, 'blurb', 'detail', 'description', 'body', 'text', 'message', 'note', 'hint', 'summary', 'line', 'keywords')) {
    return LOREM.slice(0, 48 + ((index * 17) % 50));
  }
  return `${humanise(key)} ${index + 1}`;
};

const buildObject = (node: Shape, index: number): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, sub] of node.fields) out[key] = build(key, sub, index);
  return out;
};

const build = (key: string, node: Shape, index: number): unknown => {
  if (node.array) return [0, 1, 2].map((i) => buildObject(node, i));
  if (node.fields.size > 0) return buildObject(node, index);
  return valueFor(key, index);
};

const GATES = /^(loading|working|pending|busy|saving|sending|syncing)$/;
const ALARMS = /^(error|failure|failed)$/;

export const sampleData = (definition: ActionDefinition): Record<string, unknown> => {
  const declared = (definition.data ?? {}) as Record<string, unknown>;
  const typed = ((definition.input as { properties?: Record<string, { type?: string }> } | undefined)?.properties ?? {}) as Record<string, { type?: string }>;

  const root = shape();
  collect(definition.layout ?? {}, new Map([['', root]]));

  const out: Record<string, unknown> = { ...declared };
  for (const key of new Set([...Object.keys(declared), ...root.fields.keys()])) {
    const current = declared[key];
    const kind = typeof current === 'undefined' ? typed[key]?.type : typeof current;

    if (kind === 'boolean') {
      out[key] = GATES.test(key) ? false : ALARMS.test(key) ? false : current === true;
      continue;
    }
    if (ALARMS.test(key)) {
      out[key] = '';
      continue;
    }
    const node = root.fields.get(key);
    if (node === undefined) continue;
    out[key] = build(key, node, 0);
  }
  return out;
};
