import type {
  DatabaseSchema,
  EntitySchema,
  FieldSchema,
  RelationSchema,
  IndexSchema,
  NormalizedType,
} from '../../schemas/database.schema.js';
import type { IntrospectOptions } from '../adapter.types.js';

// ═══════════════════════════════════════════════════════════════
// PgPool type (no dependency on `pg` package)
// ═══════════════════════════════════════════════════════════════

export type PgQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[]; fields?: Array<{ name: string; dataTypeID: number }> }>;

export type PgPool = {
  query: PgQuery;
  // Several statements land together or not at all.
  //
  // This was missing, and it was not a gap in a future feature: vex's own
  // `executeMutation` throws "Batch mutations require a transactional client"
  // whenever a mutation entry is an ARRAY, and no adapter in the repo
  // supplied one — so every batch write failed at runtime with a message
  // about a client nobody could construct. Optional because a pool that
  // genuinely cannot transact should say so by omission rather than by
  // pretending and breaking atomicity quietly.
  transaction?: <T>(fn: (tx: { query: PgQuery }) => Promise<T>) => Promise<T>;
};

// ═══════════════════════════════════════════════════════════════
// Type mapping
// ═══════════════════════════════════════════════════════════════

const normalizeType = (pgType: string): NormalizedType => {
  const lower = pgType.toLowerCase();

  // String types
  if (
    lower.startsWith('varchar') ||
    lower.startsWith('character varying') ||
    lower === 'text' ||
    lower.startsWith('char') ||
    lower === 'name' ||
    lower === 'citext'
  ) {
    return 'string';
  }

  // Number types
  if (
    lower === 'integer' ||
    lower === 'int' ||
    lower === 'bigint' ||
    lower === 'smallint' ||
    lower === 'serial' ||
    lower === 'bigserial' ||
    lower === 'smallserial' ||
    lower === 'numeric' ||
    lower.startsWith('numeric') ||
    lower === 'decimal' ||
    lower.startsWith('decimal') ||
    lower === 'real' ||
    lower === 'double precision' ||
    lower === 'float' ||
    lower.startsWith('float')
  ) {
    return 'number';
  }

  // Boolean
  if (lower === 'boolean' || lower === 'bool') return 'boolean';

  // Date
  if (lower === 'date') return 'date';

  // Timestamp
  if (lower.startsWith('timestamp')) return 'timestamp';

  // UUID
  if (lower === 'uuid') return 'uuid';

  // JSON
  if (lower === 'json' || lower === 'jsonb') return 'json';

  // Array types (e.g., text[], integer[], etc.)
  if (lower === 'array' || lower.endsWith('[]') || lower.startsWith('_')) return 'array';

  // Vector (pgvector)
  if (lower === 'vector' || lower.startsWith('vector')) return 'vector';

  return 'unknown';
};

const extractVectorDimensions = (pgType: string): number | undefined => {
  // vector(384) → 384
  const match = /vector\((\d+)\)/i.exec(pgType);
  if (match !== null && match[1] !== undefined) {
    return parseInt(match[1], 10);
  }
  return undefined;
};

// ═══════════════════════════════════════════════════════════════
// SQL queries for introspection
// ═══════════════════════════════════════════════════════════════

const TABLES_QUERY = `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = $1
    AND table_type = 'BASE TABLE'
  ORDER BY table_name
`;

const COLUMNS_QUERY = `
  SELECT
    c.table_name,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default,
    CASE
      WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
      WHEN c.data_type = 'ARRAY' THEN c.udt_name
      ELSE c.data_type
    END AS effective_type,
    COALESCE(
      (SELECT format_type(a.atttypid, a.atttypmod)
       FROM pg_attribute a
       JOIN pg_class cl ON a.attrelid = cl.oid
       JOIN pg_namespace ns ON cl.relnamespace = ns.oid
       WHERE cl.relname = c.table_name
         AND ns.nspname = $1
         AND a.attname = c.column_name
         AND a.attnum > 0),
      c.data_type
    ) AS full_type
  FROM information_schema.columns c
  WHERE c.table_schema = $1
  ORDER BY c.table_name, c.ordinal_position
`;

// Every key at once — primary, unique and foreign — from pg_constraint, with
// the columns in the key's own order and a foreign key's referencing and
// referenced columns zipped BY POSITION: a two-column key is one row with
// two ordered pairs.
//
// information_schema cannot say this. key_column_usage (the referencing
// columns) and constraint_column_usage (the referenced ones) share only the
// constraint's name, so joining them pairs every referencing column with
// every referenced one, and a key over N columns came back as N×N rows —
// each read as its own relation, the first of which the resolver joined on.
// Which came first was row order. A key referencing (id, builder_id) joined
// on role_id = builder_id and matched nothing, and nothing said so.
//
// Ordered by OID, which is creation order. Where two tables reference each
// other both ways the first-declared key wins the join, and a schema that
// leans on that (a tenant's builder over a builder's home tenant) is leaning
// on this ORDER BY. The referenced table must share the schema; a key into
// another schema names a table no entity here carries and is left out, as
// before.
const CONSTRAINTS_QUERY = `
  SELECT
    c.contype::text AS kind,
    rel.relname AS from_table,
    frel.relname AS to_table,
    array_agg(a.attname ORDER BY k.n)::text[] AS from_columns,
    array_agg(fa.attname ORDER BY k.n)::text[] AS to_columns
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  LEFT JOIN pg_class frel ON frel.oid = c.confrelid AND frel.relnamespace = rel.relnamespace
  CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(attnum, fattnum, n)
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
  LEFT JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = k.fattnum
  WHERE ns.nspname = $1
    AND c.contype IN ('p', 'u', 'f')
  GROUP BY c.oid, c.contype, rel.relname, frel.relname
  ORDER BY c.oid
`;

const INDEXES_QUERY = `
  SELECT
    i.tablename AS table_name,
    i.indexname AS index_name,
    ix.indisunique AS is_unique,
    am.amname AS index_type,
    array_agg(a.attname ORDER BY k.n)::text[] AS columns
  FROM pg_indexes i
  JOIN pg_class c ON c.relname = i.indexname
  JOIN pg_index ix ON ix.indexrelid = c.oid
  JOIN pg_am am ON am.oid = c.relam
  CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, n)
  JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
  WHERE i.schemaname = $1
  GROUP BY i.tablename, i.indexname, ix.indisunique, am.amname
  ORDER BY i.tablename, i.indexname
`;

const ROW_COUNTS_QUERY = `
  SELECT
    relname AS table_name,
    n_live_tup AS row_count
  FROM pg_stat_user_tables
  WHERE schemaname = $1
`;

// ═══════════════════════════════════════════════════════════════
// Introspection
// ═══════════════════════════════════════════════════════════════

export const introspectPostgres = async (
  pool: PgPool,
  options?: IntrospectOptions,
): Promise<DatabaseSchema> => {
  const schemaName = options?.schema ?? 'public';

  // Run all queries in parallel
  const [tablesResult, columnsResult, keysResult, indexesResult, rowCountsResult] = await Promise.all([
    pool.query(TABLES_QUERY, [schemaName]),
    pool.query(COLUMNS_QUERY, [schemaName]),
    pool.query(CONSTRAINTS_QUERY, [schemaName]),
    pool.query(INDEXES_QUERY, [schemaName]),
    pool.query(ROW_COUNTS_QUERY, [schemaName]),
  ]);

  // ─── Keys ──────────────────────────────────────────────────
  type Key = {
    kind: 'p' | 'u' | 'f';
    fromTable: string;
    toTable: string | null;
    fromColumns: string[];
    toColumns: Array<string | null>;
  };

  const keys: Key[] = keysResult.rows.map((row) => ({
    kind: row['kind'] as Key['kind'],
    fromTable: row['from_table'] as string,
    toTable: (row['to_table'] as string | null) ?? null,
    fromColumns: row['from_columns'] as string[],
    toColumns: row['to_columns'] as Array<string | null>,
  }));

  // Primary keys: table -> PK column names (flags the field)
  const pkMap = new Map<string, Set<string>>();
  // Every column set that makes a row unique — primary and unique keys,
  // whole. A foreign key's reverse is hasOne when the key CONTAINS one of
  // these sets, not when one of its columns appears in any of them:
  // UNIQUE (builder_id, name) says nothing about builder_id alone.
  const uniqueSets = new Map<string, string[][]>();
  for (const key of keys) {
    if (key.kind === 'f') continue;
    if (key.kind === 'p') {
      let cols = pkMap.get(key.fromTable);
      if (cols === undefined) {
        cols = new Set();
        pkMap.set(key.fromTable, cols);
      }
      for (const col of key.fromColumns) cols.add(col);
    }
    let sets = uniqueSets.get(key.fromTable);
    if (sets === undefined) {
      sets = [];
      uniqueSets.set(key.fromTable, sets);
    }
    sets.push(key.fromColumns);
  }

  // Row counts: table -> count
  const rowCountMap = new Map<string, number>();
  for (const row of rowCountsResult.rows) {
    const table = row['table_name'] as string;
    const count = Number(row['row_count'] ?? 0);
    rowCountMap.set(table, count);
  }

  // ─── Columns grouped by table ─────────────────────────────
  const columnsByTable = new Map<string, FieldSchema[]>();
  for (const row of columnsResult.rows) {
    const table = row['table_name'] as string;
    const colName = row['column_name'] as string;
    const dataType = row['effective_type'] as string;
    const fullType = row['full_type'] as string;
    const isNullable = row['is_nullable'] as string;
    const colDefault = row['column_default'] as string | null;

    const tablePks = pkMap.get(table);
    const isPk = tablePks !== undefined && tablePks.has(colName);

    const nt = normalizeType(fullType ?? dataType);
    const vecDims = nt === 'vector' ? extractVectorDimensions(fullType ?? dataType) : undefined;

    const field: FieldSchema = {
      name: colName,
      type: fullType ?? dataType,
      normalizedType: nt,
      nullable: isNullable === 'YES',
      primaryKey: isPk,
      ...(colDefault !== null ? { defaultValue: colDefault } : {}),
      ...(vecDims !== undefined ? { vectorDimensions: vecDims } : {}),
    };

    let fields = columnsByTable.get(table);
    if (fields === undefined) {
      fields = [];
      columnsByTable.set(table, fields);
    }
    fields.push(field);
  }

  // ─── Foreign keys → Relations ──────────────────────────────
  // One key, two relations: the referencing side's belongsTo and the
  // referenced side's reverse, each carrying the whole key as ordered pairs.
  const relationsByTable = new Map<string, RelationSchema[]>();
  const addRelation = (table: string, relation: RelationSchema): void => {
    let rels = relationsByTable.get(table);
    if (rels === undefined) {
      rels = [];
      relationsByTable.set(table, rels);
    }
    rels.push(relation);
  };

  for (const key of keys) {
    if (key.kind !== 'f' || key.toTable === null) continue;
    const foreignFields = key.toColumns.filter((col): col is string => col !== null);
    if (foreignFields.length !== key.fromColumns.length) continue;

    const isFkUnique = (uniqueSets.get(key.fromTable) ?? []).some((set) =>
      set.every((col) => key.fromColumns.includes(col)),
    );

    // belongsTo: this table's key points at the other table
    addRelation(key.fromTable, {
      type: 'belongsTo',
      entity: key.toTable,
      localFields: key.fromColumns,
      foreignFields,
    });

    // hasOne or hasMany: the other table's reverse of the same key
    addRelation(key.toTable, {
      type: isFkUnique ? 'hasOne' : 'hasMany',
      entity: key.fromTable,
      localFields: foreignFields,
      foreignFields: key.fromColumns,
    });
  }

  // ─── Indexes ───────────────────────────────────────────────
  const indexesByTable = new Map<string, IndexSchema[]>();

  for (const row of indexesResult.rows) {
    const table = row['table_name'] as string;
    const indexName = row['index_name'] as string;
    const isUnique = row['is_unique'] as boolean;
    const indexType = row['index_type'] as string;
    const columns = row['columns'] as string[];

    const mappedType = mapIndexType(indexType);

    const idx: IndexSchema = {
      name: indexName,
      fields: columns,
      unique: isUnique,
      type: mappedType,
    };

    let idxList = indexesByTable.get(table);
    if (idxList === undefined) {
      idxList = [];
      indexesByTable.set(table, idxList);
    }
    idxList.push(idx);
  }

  // ─── Build entities ────────────────────────────────────────
  const filteredTables = tablesResult.rows.filter((row) => {
    const name = row['table_name'] as string;
    if (options?.entities !== undefined && !options.entities.includes(name)) return false;
    if (options?.exclude !== undefined && options.exclude.includes(name)) return false;
    return true;
  });

  const entities: EntitySchema[] = filteredTables.map((row) => {
    const tableName = row['table_name'] as string;
    return {
      name: tableName,
      table: tableName,
      fields: columnsByTable.get(tableName) ?? [],
      relations: relationsByTable.get(tableName) ?? [],
      indexes: indexesByTable.get(tableName) ?? [],
      rowCount: rowCountMap.get(tableName),
    };
  });

  return { entities };
};

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

const mapIndexType = (pgType: string): IndexSchema['type'] => {
  const lower = pgType.toLowerCase();
  if (lower === 'btree') return 'btree';
  if (lower === 'hash') return 'hash';
  if (lower === 'gin') return 'gin';
  if (lower === 'gist') return 'gist';
  if (lower === 'ivfflat') return 'ivfflat';
  if (lower === 'hnsw') return 'hnsw';
  return 'other';
};
