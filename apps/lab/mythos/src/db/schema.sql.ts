// The one entity. `bloom` (a doodle kind) is stamped by the create
// handler; `done_on` by the done handler — writes own derivation so the
// streak/combo reads stay plain SQL over plain columns.
export const SCHEMA_SQL = `
create table todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text not null default '',
  due_date date,
  bloom text not null,
  done boolean not null default false,
  done_at timestamptz,
  done_on date,
  created_at timestamptz not null default now()
);

create index todos_done_idx on todos (done);
create index todos_due_date_idx on todos (due_date);
create index todos_done_on_idx on todos (done_on);
`;
