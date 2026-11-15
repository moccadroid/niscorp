import { z } from 'zod';

// A name is the only authored text that reaches SQL as text (values bind as
// parameters or are quoted as literals), so it is held to this grammar. In a
// value position, `isFieldPathShape` decides whether a string is a column or
// a literal.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

export const isIdentifier = (value: string): boolean => IDENTIFIER.test(value);

export const isFieldPathShape = (value: unknown): value is string => typeof value === 'string' && FIELD_PATH.test(value);

// The words Postgres refuses as a bare table or column name: its reserved
// keywords and those that can name a type or a function.
const RESERVED = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric', 'authorization', 'binary', 'both', 'case', 'cast',
  'check', 'collate', 'collation', 'column', 'concurrently', 'constraint', 'create', 'cross', 'current_catalog', 'current_date',
  'current_role', 'current_schema', 'current_time', 'current_timestamp', 'current_user', 'default', 'deferrable', 'desc', 'distinct',
  'do', 'else', 'end', 'except', 'false', 'fetch', 'for', 'foreign', 'freeze', 'from', 'full', 'grant', 'group', 'having', 'ilike',
  'in', 'initially', 'inner', 'intersect', 'into', 'is', 'isnull', 'join', 'lateral', 'leading', 'left', 'like', 'limit', 'localtime',
  'localtimestamp', 'natural', 'not', 'notnull', 'null', 'offset', 'on', 'only', 'or', 'order', 'outer', 'overlaps', 'placing',
  'primary', 'references', 'returning', 'right', 'select', 'session_user', 'similar', 'some', 'symmetric', 'system_user', 'table',
  'tablesample', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'user', 'using', 'variadic', 'verbose', 'when', 'where',
  'window', 'with',
]);
const LOWER_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

// Postgres folds a bare name to lower case, so a table or column name is
// written bare only where it reads back as itself.
export const sqlName = (name: string): string => (LOWER_IDENTIFIER.test(name) && !RESERVED.has(name) ? name : quoteIdent(name));

export const IdentifierSchema = z
  .string()
  .regex(IDENTIFIER, 'A name is letters, digits and underscores, not starting with a digit');

export const FieldPathSchema = z
  .string()
  .regex(FIELD_PATH, 'A field path is entity.field — each part letters, digits and underscores, not starting with a digit');
