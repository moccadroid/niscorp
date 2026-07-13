// The Fable schema — one table. TEXT PK with a uuid default so the DB mints
// ids on create; `done_at` is stamped by the set-done endpoint, never the
// client. The trigram index backs the list search's `ilike`; the btree
// indexes back the done/due filters (Vex warns on unindexed filters).
export const DDL = `
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE todos (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title       TEXT NOT NULL,
  notes       TEXT,
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date    DATE,
  done        BOOLEAN NOT NULL DEFAULT false,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_todos_done ON todos (done);
CREATE INDEX idx_todos_due ON todos (due_date);
CREATE INDEX idx_todos_done_at ON todos (done_at);
CREATE INDEX idx_todos_title_trgm ON todos USING gin (title gin_trgm_ops);
`;
