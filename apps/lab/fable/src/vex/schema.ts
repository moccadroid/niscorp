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
