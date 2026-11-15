import type { Charter } from './types';

export type RoleFields = ReadonlyMap<string, unknown>;

// A charter read from JSON is whatever was written, so it is read from `unknown`.
export const fieldsOf = (value: unknown): RoleFields | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? new Map<string, unknown>(Object.entries(value)) : undefined;

export const listOf = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap((entry: unknown) => (typeof entry === 'string' ? [entry] : [])) : [];

export type CharterShape = { errors: string[]; warnings: string[] };

const ROLE_KEYS: ReadonlySet<string> = new Set(['extends', 'without', 'allow', 'deny', 'actions', 'data', 'layouts', 'functions', 'scoping']);
const SELECTION_KEYS: ReadonlySet<string> = new Set(['allow', 'deny']);
const SECTIONS = ['actions', 'data', 'layouts', 'functions'] as const;
const ADDING = ['extends', 'allow'] as const;
const TAKING_AWAY = ['without', 'deny'] as const;

const NOTHING: CharterShape = { errors: [], warnings: [] };

const merged = (shapes: readonly CharterShape[]): CharterShape => ({ errors: shapes.flatMap((shape) => shape.errors), warnings: shapes.flatMap((shape) => shape.warnings) });

const shown = (value: unknown): string => (typeof value === 'string' ? `the string ${JSON.stringify(value)}` : String(JSON.stringify(value)));

const unreadKeys = (role: string, fields: RoleFields, known: ReadonlySet<string>, prefix: string): CharterShape => ({
  errors: [],
  warnings: [...fields.keys()].flatMap((key) => (known.has(key) ? [] : [`role "${role}" has the key "${prefix}${key}", which the charter does not read: what it lists does not apply`])),
});

// What cannot be read is read as nothing. Where that grants less it is said; where it would take away less it is refused.
const listShape = (role: string, key: string, value: unknown, takesAway: boolean): CharterShape => {
  const why = takesAway ? 'what it takes away cannot be read' : 'it grants nothing';
  const found = (detail: string): CharterShape => (takesAway ? { errors: [detail], warnings: [] } : { errors: [], warnings: [detail] });
  if (value === undefined || value === null) return NOTHING;
  if (typeof value === 'string') return { errors: [], warnings: [`role "${role}": "${key}" is ${shown(value)}, read as the list ${JSON.stringify([value])}`] };
  if (!Array.isArray(value)) return found(`role "${role}": "${key}" is ${shown(value)}, which is not a list: ${why}`);
  return merged(value.map((entry: unknown) => (typeof entry === 'string' ? NOTHING : found(`role "${role}": "${key}" lists ${shown(entry)}, which is not a string: ${why}`))));
};

const sectionShape = (role: string, section: string, value: unknown): CharterShape => {
  if (value === undefined) return NOTHING;
  if (Array.isArray(value)) return listShape(role, section, value, false);
  const fields = fieldsOf(value);
  if (fields === undefined) {
    return { errors: [], warnings: [`role "${role}": "${section}" is ${shown(value)}, which grants nothing: a section is a list of globs or { allow, deny }`] };
  }
  return merged([
    unreadKeys(role, fields, SELECTION_KEYS, `${section}.`),
    listShape(role, `${section}.allow`, fields.get('allow'), false),
    listShape(role, `${section}.deny`, fields.get('deny'), true),
  ]);
};

// vex gives a scoping that names no profile no rows.
const scopingShape = (role: string, scoping: unknown): CharterShape =>
  scoping === undefined || typeof scoping === 'string' ? NOTHING : { errors: [], warnings: [`role "${role}": "scoping" is ${shown(scoping)}, which is not a name: the role reaches no rows`] };

export const roleShape = (role: string, def: unknown): CharterShape => {
  if (Array.isArray(def)) return listShape(role, 'actions', def, false);
  // Read as an empty role, a null one named in a "without" would take away nothing.
  if (def === null) return { errors: [`role "${role}" is null, which is not a list or an object: what it grants and takes away cannot be read`], warnings: [] };
  const fields = fieldsOf(def);
  if (fields === undefined) return { errors: [], warnings: [`role "${role}" is ${shown(def)}, which grants nothing: a role is a list of globs or an object`] };
  return merged([
    unreadKeys(role, fields, ROLE_KEYS, ''),
    ...ADDING.map((key) => listShape(role, key, fields.get(key), false)),
    ...TAKING_AWAY.map((key) => listShape(role, key, fields.get(key), true)),
    ...SECTIONS.map((section) => sectionShape(role, section, fields.get(section))),
    scopingShape(role, fields.get('scoping')),
  ]);
};

export const charterShape = (charter: Charter): CharterShape => merged(Object.entries(charter).map(([role, def]) => roleShape(role, def)));
