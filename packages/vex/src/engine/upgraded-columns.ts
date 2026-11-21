import { z } from 'zod';
import type { Upgrader } from '@niscorp/strata';
import type { Query } from '../schemas/query.schema.js';
import type { Row } from '../adapters/adapter.types.js';
import type { DatabaseSchema } from '../schemas/database.schema.js';
import { VexError } from '../errors.js';

export const UNREADABLE_MODES = ['refuse', 'omit', 'null'] as const;

const UpgradedColumnSchema = z
  .object({
    stamp: z.string(),
    kind: z.union([z.string(), z.object({ grammar: z.string(), column: z.string() }).strict()]),
    unreadable: z.enum(UNREADABLE_MODES).optional(),
  })
  .strict();

export const UpgradedColumnsSchema = z.record(z.string(), z.record(z.string(), UpgradedColumnSchema));

export type UpgradedColumn = z.infer<typeof UpgradedColumnSchema>;
export type UpgradedColumns = z.infer<typeof UpgradedColumnsSchema>;

export type ColumnUpgrader = Pick<Upgrader, 'upgrade' | 'locate' | 'stamp'>;

export type ColumnUpgrade = {
  path: string;
  key: string;
  stampKeys: [string, ...string[]];
  kind: string | { grammar: string; key: string };
  unreadable: (typeof UNREADABLE_MODES)[number];
};

type FieldRef = NonNullable<Query['fields']>[number];

const outputOf = (ref: FieldRef): { path: string; key: string } =>
  typeof ref === 'string' ? { path: ref, key: ref.slice(ref.indexOf('.') + 1) } : { path: ref.field, key: ref.as };

const outputsOf = (dsl: Query, path: string): string[] => (dsl.fields ?? []).map(outputOf).flatMap((out) => (out.path === path ? [out.key] : []));

const count = (value: unknown, path: string): number => {
  if (value === path) return 1;
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + count(item, path), 0);
  if (typeof value === 'object' && value !== null) return Object.values(value).reduce((sum: number, item) => sum + count(item, path), 0);
  return 0;
};

// Filters and sorts compare the stored value and return nothing of it; outside
// them, only the outer read's own fields may name the column.
const usesOutsideFields = (dsl: Query, path: string, outer: boolean): number =>
  Object.entries(dsl).reduce((sum, [part, value]) => {
    if (part === 'filter' || part === 'sort' || (outer && part === 'fields')) return sum;
    if (part !== 'from') return sum + count(value, path);
    return sum + dsl.from.reduce((inner, source) => inner + (typeof source === 'string' ? 0 : usesOutsideFields(source.query, path, false)), 0);
  }, 0);

const selected = (dsl: Query, path: string, upgraded: string): [string, ...string[]] => {
  const [first, ...rest] = outputsOf(dsl, path);
  if (first === undefined) throw new VexError('invalid_dsl', `This read returns ${upgraded}, which is upgraded where it is read, without ${path}: add ${path} to its fields.`);
  return [first, ...rest];
};

const refuseSharedKeys = (dsl: Query, upgrades: readonly ColumnUpgrade[]): void => {
  const sourcesByKey = new Map<string, Set<string>>();
  const note = (key: string, source: string): void => {
    sourcesByKey.set(key, (sourcesByKey.get(key) ?? new Set()).add(source));
  };
  for (const { path, key } of (dsl.fields ?? []).map(outputOf)) note(key, path);
  for (const key of [...Object.keys(dsl.compute ?? {}), ...Object.keys(dsl.aggregate ?? {})]) note(key, `the computed ${key}`);
  const used = upgrades.flatMap((upgrade) => [upgrade.key, ...upgrade.stampKeys, ...(typeof upgrade.kind === 'string' ? [] : [upgrade.kind.key])]);
  const shared = [...new Set(used)].filter((key) => (sourcesByKey.get(key)?.size ?? 0) > 1);
  if (shared.length > 0) {
    throw new VexError('invalid_dsl', `This read returns two values under one key (${shared.join(', ')}), and one is an upgraded column, its stamp or its kind: give each its own key with \`as\`.`);
  }
};

const declared = (columns: UpgradedColumns): { table: string; column: string; upgraded: UpgradedColumn }[] =>
  Object.entries(columns).flatMap(([table, byColumn]) => Object.entries(byColumn).map(([column, upgraded]) => ({ table, column, upgraded })));

export const columnUpgrades = (dsl: Query, columns: UpgradedColumns): ColumnUpgrade[] => {
  const upgrades = declared(columns).flatMap(({ table, column, upgraded }) => {
    const path = `${table}.${column}`;
    if (usesOutsideFields(dsl, path, true) > 0) {
      throw new VexError(
        'invalid_dsl',
        `${path} is upgraded where it is read, so a read returns it only as one of its own fields, ` +
          'never through a subquery, a compute, an aggregate or a groupBy. A filter or a sort on it compares the stored value.',
      );
    }
    const keys = outputsOf(dsl, path);
    if (keys.length === 0) return [];
    const stampKeys = selected(dsl, `${table}.${upgraded.stamp}`, path);
    const kind = typeof upgraded.kind === 'string' ? upgraded.kind : { grammar: upgraded.kind.grammar, key: selected(dsl, `${table}.${upgraded.kind.column}`, path)[0] };
    return keys.map((key) => ({ path, key, stampKeys, kind, unreadable: upgraded.unreadable ?? 'refuse' }));
  });
  refuseSharedKeys(dsl, upgrades);
  return upgrades;
};

export const unknownKinds = (columns: UpgradedColumns, upgrader: ColumnUpgrader): string[] =>
  declared(columns).flatMap(({ table, column, upgraded: { kind } }) => {
    if (typeof kind !== 'string') return kind.grammar in upgrader.stamp ? [] : [`${table}.${column} names the grammar "${kind.grammar}"`];
    try {
      upgrader.locate({}, kind);
      return [];
    } catch {
      return [`${table}.${column} names the kind "${kind}"`];
    }
  });

export const mistypedColumns = (columns: UpgradedColumns, schema: DatabaseSchema): string[] =>
  declared(columns).flatMap(({ table, column, upgraded }) => {
    const fields = schema.entities.find((e) => e.name === table)?.fields ?? [];
    const json = (name: string): string[] => {
      const field = fields.find((f) => f.name === name);
      if (field === undefined) return [`${table}.${name} is not in the database`];
      return ['json', 'jsonb'].includes(field.type.toLowerCase()) ? [] : [`${table}.${name} is ${field.type}, not json`];
    };
    const { kind } = upgraded;
    const kindColumn = typeof kind === 'string' || fields.some((f) => f.name === kind.column) ? [] : [`${table}.${kind.column} is not in the database`];
    return [...json(column), ...json(upgraded.stamp), ...kindColumn];
  });

const StampSchema = z.union([z.null(), z.undefined(), z.record(z.string(), z.number().int().nonnegative())]);

const stampOf = (value: unknown, path: string): Record<string, number> => {
  const parsed = StampSchema.safeParse(value);
  if (!parsed.success) throw new VexError('execution_error', `The stamp beside ${path} is not a stamp: it must be null or an object of grammar names to whole numbers.`);
  return parsed.data ?? {};
};

const kindOf = (upgrade: ColumnUpgrade, row: Row): string => {
  if (typeof upgrade.kind === 'string') return upgrade.kind;
  const name = row[upgrade.kind.key];
  if (typeof name !== 'string') throw new VexError('execution_error', `The row's ${upgrade.kind.key} is not text, so it names no kind in ${upgrade.kind.grammar}.`);
  return `${upgrade.kind.grammar}/${name}`;
};

const reasonOf = (error: unknown): string => {
  const message = error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? `${error.code}: ` : '';
  return `${code}${message}`;
};

export type UpgradedRows = { rows: Row[]; warnings: string[] };

// Each stamp is read from the row as it came, so two columns sharing a stamp
// are both upgraded from where they were written.
export const upgradeRows = (rows: Row[], upgrades: readonly ColumnUpgrade[], upgrade: Upgrader['upgrade']): UpgradedRows => {
  if (upgrades.length === 0) return { rows, warnings: [] };
  const warnings: string[] = [];
  const upgraded = rows.flatMap((row, index) => {
    const next: Row = { ...row };
    const said: string[] = [];
    for (const column of upgrades) {
      const value = row[column.key];
      if (value === null || value === undefined) continue;
      try {
        const result = upgrade(value, { kind: kindOf(column, row), stamp: stampOf(row[column.stampKeys[0]], column.path) });
        next[column.key] = result.document;
        for (const stampKey of column.stampKeys) next[stampKey] = result.stamp;
      } catch (error) {
        if (column.unreadable === 'refuse') throw error;
        if (column.unreadable === 'omit') {
          warnings.push(`The database's row ${index} (counting from 0) was left out: its ${column.path} does not upgrade (${reasonOf(error)}).`);
          return [];
        }
        next[column.key] = null;
        said.push(`The database's row ${index} (counting from 0) has ${column.path} set to null: it does not upgrade (${reasonOf(error)}).`);
      }
    }
    warnings.push(...said);
    return [next];
  });
  return { rows: upgraded, warnings };
};
