import type { DatabaseSchema, NormalizedType } from '@niscorp/vex';
import type { WidgetBinding } from '@editor/types';

export const VEX_COMPARISON = 'vex:comparison';
export const VEX_FIELD_PATH = 'vex:field-path';
export const VEX_AGGREGATE = 'vex:aggregate';
export const VEX_COMPUTE = 'vex:compute';

const COMPARISON_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike']);
const FIELD_KEYS = new Set(['field', 'isNull', 'isNotNull']);

export const leaf = (path: string): string => path.slice(path.lastIndexOf('.') + 1);
export const isColumnListItem = (path: string): boolean => /(?:^|\.)(?:fields|groupBy)\.\*$/.test(path);

export const vexWidgets: WidgetBinding[] = [
  { role: VEX_COMPARISON, match: (field) => field.kind === 'unknown' && COMPARISON_OPS.has(leaf(field.path)) },
  { role: VEX_FIELD_PATH, match: (field) => field.kind === 'string' && (FIELD_KEYS.has(leaf(field.path)) || isColumnListItem(field.path)) },
  { role: VEX_AGGREGATE, match: (field) => field.kind === 'unknown' && leaf(field.path) === 'aggregate' },
  { role: VEX_COMPUTE, match: (field) => field.kind === 'unknown' && leaf(field.path) === 'compute' },
];

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
