import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, inject } from 'vitest';
import type { Row, TransformFn } from '../src/index';
import { initialisedDirectory } from './initialised-database';
import { TIDE_TABLES, createTideStore } from '../src/store/postgres';
import type { TidePool } from '../src/store/postgres';

export const testTransform: TransformFn = (config: unknown, source: Row): unknown => {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;

    const record: Record<string, unknown> = { ...(node as Record<string, unknown>) };

    if ('$ref' in record && typeof record.$ref === 'string') {
      const path = record.$ref.replace(/^\$\.?/, '');
      if (path === '') return source;
      return path.split('.').reduce<unknown>((value, key) => {
        if (value === null || typeof value !== 'object') return undefined;
        return (value as Record<string, unknown>)[key];
      }, source);
    }
    if ('$eq' in record && Array.isArray(record.$eq)) {
      const [left, right] = record.$eq.map(walk);
      return left === right;
    }
    if ('$not' in record) return !walk(record.$not);
    if ('$length' in record) {
      const value = walk(record.$length);
      return Array.isArray(value) ? value.length : 0;
    }
    if ('$throw' in record) throw new Error(String(record.$throw));

    return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, walk(value)]));
  };
  return walk(config);
};

export const rowsOf = (rows: readonly Row[]) => () => rows;

export const clockFrom = (start: number) => {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
      return current;
    },
  };
};

export const utc = (iso: string): number => Date.parse(iso);

// Both are called on the database, never taken off it: they are methods that reach for `this`.
export const pglitePool = (db: PGlite): TidePool => ({
  query: (text, values) => db.query(text, values),
  transaction: (fn) => db.transaction((tx) => fn({ query: (text, values) => tx.query(text, values) })),
});

export const oneDatabase = (): { emptied: () => Promise<{ db: PGlite; pool: TidePool }> } => {
  const held: { db?: PGlite } = {};
  beforeAll(async () => {
    held.db = new PGlite({ loadDataDir: initialisedDirectory(inject('initialisedDatabase')) });
    await createTideStore(pglitePool(held.db)).ready;
  });
  afterAll(async () => {
    await held.db?.close();
  });
  return {
    emptied: async () => {
      const db = held.db;
      if (db === undefined) throw new Error('oneDatabase: asked for the database before the file\'s beforeAll had started it');
      await db.exec(`TRUNCATE ${TIDE_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
      return { db, pool: pglitePool(db) };
    },
  };
};
