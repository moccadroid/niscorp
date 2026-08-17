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

const PRIMARY_KEYS_QUERY = `
  SELECT
    tc.table_name,
    kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = $1
`;

const FOREIGN_KEYS_QUERY = `
  SELECT
    tc.table_name AS from_table,
    kcu.column_name AS from_column,
    ccu.table_name AS to_table,
    ccu.column_name AS to_column,
    tc.constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = $1
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

const UNIQUE_COLUMNS_QUERY = `
  SELECT
    tc.table_name,
    kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = $1
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
  const [
    tablesResult,
    columnsResult,
    pkResult,
    fkResult,
    indexesResult,
    rowCountsResult,
    uniqueResult,
  ] = await Promise.all([
    pool.query(TABLES_QUERY, [schemaName]),
    pool.query(COLUMNS_QUERY, [schemaName]),
    pool.query(PRIMARY_KEYS_QUERY, [schemaName]),
    pool.query(FOREIGN_KEYS_QUERY, [schemaName]),
    pool.query(INDEXES_QUERY, [schemaName]),
    pool.query(ROW_COUNTS_QUERY, [schemaName]),
    pool.query(UNIQUE_COLUMNS_QUERY, [schemaName]),
  ]);

  // ─── Build lookup maps ─────────────────────────────────────

  // Primary keys: table -> Set of PK column names
  const pkMap = new Map<string, Set<string>>();
  for (const row of pkResult.rows) {
    const table = row['table_name'] as string;
    const col = row['column_name'] as string;
    let cols = pkMap.get(table);
    if (cols === undefined) {
      cols = new Set();
      pkMap.set(table, cols);
    }
    cols.add(col);
  }

  // Unique columns: table -> Set of unique column names
  const uniqueMap = new Map<string, Set<string>>();
  for (const row of uniqueResult.rows) {
    const table = row['table_name'] as string;
    const col = row['column_name'] as string;
    let cols = uniqueMap.get(table);
    if (cols === undefined) {
      cols = new Set();
      uniqueMap.set(table, cols);
    }
    cols.add(col);
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
  type FkInfo = {
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
  };

  const fkList: FkInfo[] = fkResult.rows.map((row) => ({
    fromTable: row['from_table'] as string,
    fromColumn: row['from_column'] as string,
    toTable: row['to_table'] as string,
    toColumn: row['to_column'] as string,
  }));

  const relationsByTable = new Map<string, RelationSchema[]>();

  for (const fk of fkList) {
    // Determine if the FK column is unique on the source table
    const fromUniques = uniqueMap.get(fk.fromTable);
    const fromPks = pkMap.get(fk.fromTable);
    const isFkUnique =
      (fromUniques !== undefined && fromUniques.has(fk.fromColumn)) ||
      (fromPks !== undefined && fromPks.has(fk.fromColumn));

    // belongsTo: this table's FK points to the other table
    const belongsTo: RelationSchema = {
      type: 'belongsTo',
      entity: fk.toTable,
      localField: fk.fromColumn,
      foreignField: fk.toColumn,
    };
    let fromRels = relationsByTable.get(fk.fromTable);
    if (fromRels === undefined) {
      fromRels = [];
      relationsByTable.set(fk.fromTable, fromRels);
    }
    fromRels.push(belongsTo);

    // hasOne or hasMany: the other table has a reverse relation
    const reverseType = isFkUnique ? 'hasOne' as const : 'hasMany' as const;
    const reverse: RelationSchema = {
      type: reverseType,
      entity: fk.fromTable,
      localField: fk.toColumn,
      foreignField: fk.fromColumn,
    };
    let toRels = relationsByTable.get(fk.toTable);
    if (toRels === undefined) {
      toRels = [];
      relationsByTable.set(fk.toTable, toRels);
    }
    toRels.push(reverse);
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
