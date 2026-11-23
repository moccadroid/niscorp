import type {
  DatabaseSchema,
  EntitySchema,
  FieldSchema,
  RelationSchema,
  IndexSchema,
  NormalizedType,
} from '../../schemas/database.schema.js';
import type { IntrospectOptions } from '../adapter.types.js';

export type PgQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[]; fields?: Array<{ name: string; dataTypeID: number }> }>;

export type PgPool = {
  query: PgQuery;
  transaction?: <T>(fn: (tx: { query: PgQuery }) => Promise<T>) => Promise<T>;
  statementTimeouts?: false;
};

const normalizeType = (pgType: string): NormalizedType => {
  const lower = pgType.toLowerCase();

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

  if (lower === 'boolean' || lower === 'bool') return 'boolean';

  if (lower === 'date') return 'date';

  if (lower.startsWith('timestamp')) return 'timestamp';

  if (lower === 'uuid') return 'uuid';

  if (lower === 'json' || lower === 'jsonb') return 'json';

  if (lower === 'array' || lower.endsWith('[]') || lower.startsWith('_')) return 'array';

  if (lower === 'vector' || lower.startsWith('vector')) return 'vector';

  return 'unknown';
};

const extractVectorDimensions = (pgType: string): number | undefined => {
  const match = /vector\((\d+)\)/i.exec(pgType);
  if (match !== null && match[1] !== undefined) {
    return parseInt(match[1], 10);
  }
  return undefined;
};

// A view is read only where it is listed: one nobody listed may have been made
// for something else, and what it shows is not the app's to serve.
const TABLES_QUERY = `
  SELECT t.table_name, t.table_type, obj_description(cl.oid, 'pg_class') AS description
  FROM information_schema.tables t
  JOIN pg_namespace ns ON ns.nspname = t.table_schema
  JOIN pg_class cl ON cl.relname = t.table_name AND cl.relnamespace = ns.oid
  WHERE t.table_schema = $1
    AND (t.table_type = 'BASE TABLE' OR (t.table_type = 'VIEW' AND t.table_name::text = ANY($2::text[])))
  ORDER BY t.table_name
`;

// What each view of the schema reads, from its SELECT rule, one level down: a
// view of the schema is followed in code. What vex cannot follow is `outside`,
// as Postgres names it: a relation of another schema or of a kind vex does not
// read, and any function but Postgres's own (an id below 16384, its first for
// objects made after initdb), called or behind an operator, since what a
// function reads Postgres does not record. An extension the caller lists is
// trusted to read no table. A composite type is a shape, not rows.
const VIEW_READS_QUERY = `
  SELECT v.relname AS view_name, under.kind, under.name
  FROM pg_class v
  JOIN pg_namespace ns ON ns.oid = v.relnamespace
  LEFT JOIN LATERAL (
    SELECT
      CASE WHEN tns.nspname <> $1 OR t.relkind NOT IN ('r', 'p', 'v') THEN 'outside' WHEN t.relkind = 'v' THEN 'view' ELSE 'table' END AS kind,
      CASE WHEN tns.nspname = $1 AND t.relkind IN ('r', 'p', 'v') THEN t.relname::text
        ELSE (CASE t.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view'
          WHEN 'S' THEN 'sequence' WHEN 'f' THEN 'foreign table' ELSE 'relation' END) || ' ' || quote_ident(tns.nspname) || '.' || quote_ident(t.relname)
      END AS name
    FROM pg_rewrite r
    JOIN pg_depend d ON d.objid = r.oid AND d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace tns ON tns.oid = t.relnamespace
    WHERE r.ev_class = v.oid AND r.ev_type = '1' AND t.oid <> v.oid AND t.relkind <> 'c'
    UNION
    SELECT 'outside', 'function ' || p.oid::regprocedure::text || COALESCE(' of extension ' || x.extname, '')
    FROM pg_rewrite r
    JOIN pg_depend d ON d.objid = r.oid AND d.classid = 'pg_rewrite'::regclass
    LEFT JOIN pg_operator o ON d.refclassid = 'pg_operator'::regclass AND o.oid = d.refobjid
    JOIN pg_proc p ON p.oid = CASE WHEN d.refclassid = 'pg_proc'::regclass THEN d.refobjid ELSE o.oprcode::oid END
    LEFT JOIN pg_depend xd ON xd.classid = 'pg_proc'::regclass AND xd.objid = p.oid AND xd.deptype = 'e'
    LEFT JOIN pg_extension x ON x.oid = xd.refobjid
    WHERE r.ev_class = v.oid AND r.ev_type = '1' AND p.oid >= 16384
      AND (x.extname IS NULL OR NOT x.extname = ANY($2::text[]))
  ) under ON true
  WHERE ns.nspname = $1
    AND v.relkind = 'v'
  ORDER BY view_name, under.kind, under.name
`;

type ViewUnder = { kind: 'table' | 'view' | 'outside'; name: string };

const underView = (view: string, direct: ReadonlyMap<string, readonly ViewUnder[]>): { reads: string[]; outside?: string[] } => {
  const reads = new Set<string>();
  const outside = new Set<string>();
  const seen = new Set<string>([view]);
  const pending = [...(direct.get(view) ?? [])];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next.kind === 'table') reads.add(next.name);
    else if (next.kind === 'outside') outside.add(next.name);
    else if (!seen.has(next.name)) {
      seen.add(next.name);
      pending.push(...(direct.get(next.name) ?? []));
    }
  }
  return { reads: [...reads].sort(), ...(outside.size > 0 ? { outside: [...outside].sort() } : {}) };
};

const COLUMNS_QUERY = `
  SELECT
    c.table_name,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default,
    c.is_identity,
    c.identity_generation,
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
    ) AS full_type,
    (SELECT col_description(a.attrelid, a.attnum)
     FROM pg_attribute a
     JOIN pg_class cl ON a.attrelid = cl.oid
     JOIN pg_namespace ns ON cl.relnamespace = ns.oid
     WHERE cl.relname = c.table_name
       AND ns.nspname = $1
       AND a.attname = c.column_name
       AND a.attnum > 0) AS description
  FROM information_schema.columns c
  WHERE c.table_schema = $1
  ORDER BY c.table_name, c.ordinal_position
`;

// pg_constraint, not information_schema: key_column_usage and
// constraint_column_usage share only the constraint's name, so joining them
// pairs every referencing column of a composite key with every referenced one.
// ORDER BY oid is creation order: where two tables reference each other both
// ways, the first-declared key wins the resolver's join.
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

export const introspectPostgres = async (
  pool: PgPool,
  options?: IntrospectOptions,
): Promise<DatabaseSchema> => {
  const schemaName = options?.schema ?? 'public';
  const views = [...(options?.views ?? [])];
  const viewExtensions = [...(options?.viewExtensions ?? [])];

  const [tablesResult, columnsResult, keysResult, indexesResult, rowCountsResult, viewReadsResult] = await Promise.all([
    pool.query(TABLES_QUERY, [schemaName, views]),
    pool.query(COLUMNS_QUERY, [schemaName]),
    pool.query(CONSTRAINTS_QUERY, [schemaName]),
    pool.query(INDEXES_QUERY, [schemaName]),
    pool.query(ROW_COUNTS_QUERY, [schemaName]),
    views.length === 0 ? { rows: [] } : pool.query(VIEW_READS_QUERY, [schemaName, viewExtensions]),
  ]);

  const viewReads = new Map<string, ViewUnder[]>();
  for (const row of viewReadsResult.rows) {
    const view = row['view_name'] as string;
    const kind = row['kind'] as ViewUnder['kind'] | null;
    viewReads.set(view, [...(viewReads.get(view) ?? []), ...(kind === null ? [] : [{ kind, name: row['name'] as string }])]);
  }

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

  const pkMap = new Map<string, Set<string>>();
  // Whole column sets: a foreign key's reverse is hasOne only when the key
  // contains one of them. UNIQUE (builder_id, name) says nothing about
  // builder_id alone.
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

  const rowCountMap = new Map<string, number>();
  for (const row of rowCountsResult.rows) {
    const table = row['table_name'] as string;
    const count = Number(row['row_count'] ?? 0);
    rowCountMap.set(table, count);
  }

  const columnsByTable = new Map<string, FieldSchema[]>();
  for (const row of columnsResult.rows) {
    const table = row['table_name'] as string;
    const colName = row['column_name'] as string;
    const dataType = row['effective_type'] as string;
    const fullType = row['full_type'] as string;
    const isNullable = row['is_nullable'] as string;
    // An identity column has no column_default, yet the database writes it.
    const colDefault =
      (row['column_default'] as string | null) ?? (row['is_identity'] === 'YES' ? `GENERATED ${String(row['identity_generation'])} AS IDENTITY` : null);
    const colDescription = row['description'] as string | null;

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
      ...(colDescription !== null && colDescription !== '' ? { description: colDescription } : {}),
      ...(vecDims !== undefined ? { vectorDimensions: vecDims } : {}),
    };

    let fields = columnsByTable.get(table);
    if (fields === undefined) {
      fields = [];
      columnsByTable.set(table, fields);
    }
    fields.push(field);
  }

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

    addRelation(key.fromTable, {
      type: 'belongsTo',
      entity: key.toTable,
      localFields: key.fromColumns,
      foreignFields,
    });

    addRelation(key.toTable, {
      type: isFkUnique ? 'hasOne' : 'hasMany',
      entity: key.fromTable,
      localFields: foreignFields,
      foreignFields: key.fromColumns,
    });
  }

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

  const filteredTables = tablesResult.rows.filter((row) => {
    const name = row['table_name'] as string;
    if (options?.entities !== undefined && !options.entities.includes(name)) return false;
    if (options?.exclude !== undefined && options.exclude.includes(name)) return false;
    return true;
  });

  const entities: EntitySchema[] = filteredTables.map((row) => {
    const tableName = row['table_name'] as string;
    const tableDescription = row['description'] as string | null;
    return {
      name: tableName,
      table: tableName,
      ...(tableDescription !== null && tableDescription !== '' ? { description: tableDescription } : {}),
      fields: columnsByTable.get(tableName) ?? [],
      relations: relationsByTable.get(tableName) ?? [],
      indexes: indexesByTable.get(tableName) ?? [],
      rowCount: rowCountMap.get(tableName),
      ...(row['table_type'] === 'VIEW' ? { view: underView(tableName, viewReads) } : {}),
    };
  });

  return { entities };
};

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
