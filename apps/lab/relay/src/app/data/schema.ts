// Relay's Postgres schema, run once against PGlite at boot.
//
// Every read in Relay is a Vex shape over these tables; Vex introspects
// the DDL (columns, types, primary keys, foreign-key relations, indexes)
// to validate and compile the authored queries. Keep foreign keys honest
// — Vex's join planning reads them.

export const DDL = /* sql */ `
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

  CREATE TABLE users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    avatar_url  TEXT,
    role        TEXT NOT NULL DEFAULT 'rep'
  );

  CREATE TABLE companies (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name        TEXT NOT NULL,
    domain      TEXT,
    industry    TEXT,
    size        TEXT,
    owner_id    TEXT REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE contacts (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    email       TEXT,
    phone       TEXT,
    title       TEXT,
    -- Deleting a company removes its people (they'd otherwise orphan behind an
    -- INNER join and vanish from every list).
    company_id  TEXT REFERENCES companies(id) ON DELETE CASCADE,
    owner_id    TEXT REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE pipelines (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT false
  );

  CREATE TABLE stages (
    id               TEXT PRIMARY KEY,
    pipeline_id      TEXT NOT NULL REFERENCES pipelines(id),
    name             TEXT NOT NULL,
    position         INTEGER NOT NULL,
    win_probability  NUMERIC NOT NULL DEFAULT 0
  );

  CREATE TABLE deals (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title               TEXT NOT NULL,
    -- A deal belongs to its company (deleting the company deletes the deal);
    -- the primary contact is a soft link (deleting the person just clears it).
    company_id          TEXT REFERENCES companies(id) ON DELETE CASCADE,
    primary_contact_id  TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    value               NUMERIC NOT NULL DEFAULT 0,
    currency            TEXT NOT NULL DEFAULT 'USD',
    stage_id            TEXT NOT NULL REFERENCES stages(id),
    owner_id            TEXT REFERENCES users(id),
    status              TEXT NOT NULL DEFAULT 'open',
    close_date          DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE products (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    sku         TEXT NOT NULL,
    unit_price  NUMERIC NOT NULL DEFAULT 0
  );

  CREATE TABLE deal_products (
    id          TEXT PRIMARY KEY,
    deal_id     TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    product_id  TEXT NOT NULL REFERENCES products(id),
    quantity    INTEGER NOT NULL DEFAULT 1,
    unit_price  NUMERIC NOT NULL DEFAULT 0
  );

  CREATE TABLE activities (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    subject     TEXT NOT NULL,
    body        TEXT,
    -- Activity outlives the records it mentions; deleting any of them just
    -- clears the link.
    contact_id  TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    company_id  TEXT REFERENCES companies(id) ON DELETE SET NULL,
    deal_id     TEXT REFERENCES deals(id) ON DELETE SET NULL,
    owner_id    TEXT REFERENCES users(id),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE tasks (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title       TEXT NOT NULL,
    due_date    DATE,
    done        BOOLEAN NOT NULL DEFAULT false,
    assignee_id TEXT REFERENCES users(id),
    -- A task survives the records it references; deleting them clears the link.
    contact_id  TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    company_id  TEXT REFERENCES companies(id) ON DELETE SET NULL,
    deal_id     TEXT REFERENCES deals(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE lists (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL,
    kind  TEXT NOT NULL DEFAULT 'static'
  );

  CREATE TABLE list_members (
    id          TEXT PRIMARY KEY,
    list_id     TEXT NOT NULL REFERENCES lists(id),
    contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE
  );

  -- The action catalog. v1 loads the Nova registry from here and treats it
  -- as data; v2 adds an embedding column + a Vex semantic shape and this
  -- table becomes findAction.
  CREATE TABLE actions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    scope       TEXT NOT NULL DEFAULT 'crm',
    kind        TEXT NOT NULL,
    definition  JSONB NOT NULL
  );

  CREATE INDEX idx_contacts_company ON contacts(company_id);
  CREATE INDEX idx_contacts_owner   ON contacts(owner_id);
  CREATE INDEX idx_deals_company    ON deals(company_id);
  CREATE INDEX idx_deals_stage      ON deals(stage_id);
  CREATE INDEX idx_deals_owner      ON deals(owner_id);
  CREATE INDEX idx_deals_status     ON deals(status);
  CREATE INDEX idx_activities_deal  ON activities(deal_id);
  CREATE INDEX idx_activities_when  ON activities(occurred_at);
  CREATE INDEX idx_tasks_assignee   ON tasks(assignee_id);
  CREATE INDEX idx_tasks_due        ON tasks(due_date);
  CREATE INDEX idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops);
  CREATE INDEX idx_contacts_name_trgm  ON contacts  USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
`;

// The tables the schema defines — the `data` universe is TABLES × verbs.
// Derived by hand from the DDL (schema.ts) for the client proof; the server
// derives it from vex introspection. The single source charter's data
// section resolves against and the engine's full policy is built from.
export const TABLES = [
  'users',
  'companies',
  'contacts',
  'pipelines',
  'stages',
  'deals',
  'products',
  'deal_products',
  'activities',
  'tasks',
  'lists',
  'list_members',
  'actions',
] as const;
