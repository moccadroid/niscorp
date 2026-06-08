import type { PGlite } from '@electric-sql/pglite';
import type { PgPool } from '@niscorp/vex';

// PGlite already returns `{ rows, fields: [{ name, dataTypeID }] }` —
// exactly the structural `PgPool` @niscorp/vex's Postgres adapter
// expects. The only adaptation is the call signature (PGlite takes an
// options arg we don't use).
export const createPglitePool = (db: PGlite): PgPool => ({
  query: (text, values) => db.query(text, values as unknown[]),
});
