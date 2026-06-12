import type { DatabaseSchema, NormalizedType } from '@niscorp/vex';
import type { WidgetBinding } from '@editor/types';

// The vex widgets — framework-free. Each is a role (the component name its render
// registers under) plus a matcher that claims fields by the tail of their path,
// so a rule works at any depth (a comparison operand is `…eq` whether top-level or
// nested). The render components live in ./react and close over the catalog.

export const VEX_COMPARISON = 'vex:comparison';
export const VEX_FIELD_PATH = 'vex:field-path';
export const VEX_AGGREGATE = 'vex:aggregate';
export const VEX_COMPUTE = 'vex:compute';

const COMPARISON_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike']);
const FIELD_KEYS = new Set(['field', 'isNull', 'isNotNull']);

export const leaf = (path: string): string => path.slice(path.lastIndexOf('.') + 1);
// An item of the `fields` / `groupBy` arrays (path tail `fields.*` / `groupBy.*`).
export const isColumnListItem = (path: string): boolean => /(?:^|\.)(?:fields|groupBy)\.\*$/.test(path);

// The matchers, by where each field sits in the query. The compiler renders a
// matched field with the role's component instead of the type default.
export const vexWidgets: WidgetBinding[] = [
  // A comparison `[left, right]`: a field-path picker + a typed operand.
  { role: VEX_COMPARISON, match: (field) => field.kind === 'unknown' && COMPARISON_OPS.has(leaf(field.path)) },
  // A standalone field path: a sort key, `isNull`/`isNotNull`, or a `fields` / `groupBy` item.
  { role: VEX_FIELD_PATH, match: (field) => field.kind === 'string' && (FIELD_KEYS.has(leaf(field.path)) || isColumnListItem(field.path)) },
  // `aggregate` / `compute` records (alias -> expression): keyed-entry editors.
  { role: VEX_AGGREGATE, match: (field) => field.kind === 'unknown' && leaf(field.path) === 'aggregate' },
  { role: VEX_COMPUTE, match: (field) => field.kind === 'unknown' && leaf(field.path) === 'compute' },
];

// The database's columns and their types, narrowed by the render widgets. Built
// from the introspected schema; gives the field-path pickers their column list.
export type Catalog = { columns: string[]; typeOf: (column: string) => NormalizedType | undefined };

export const catalogOf = (db: DatabaseSchema): Catalog => {
  const types = new Map<string, NormalizedType>();
  const columns: string[] = [];
  for (const entity of db.entities) {
    for (const field of entity.fields) {
      const column = `${entity.name}.${field.name}`;
      columns.push(column);
      types.set(column, field.normalizedType);
    }
  }
  return { columns, typeOf: (column) => types.get(column) };
};
