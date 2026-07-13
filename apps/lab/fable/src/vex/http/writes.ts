import type { PGlite } from '@electric-sql/pglite';
import { TodoSaveBody, TodoSetDoneBody, TodoDeleteBody } from '@fable/api/todos';

// ═══════════════════════════════════════════════════════════
// Writes — plain endpoint handlers (D4). One URL per write, a Zod `.strict()`
// parse at the boundary, parameterized SQL, `{ result }` out. No client-
// supplied identity: `done_at` is stamped HERE, the row id is minted by the
// DB on create. When there is a real backend these become routes; the URLs
// and bodies don't change.
// ═══════════════════════════════════════════════════════════

export type WriteResult = { status: number; body: unknown };

const bad = (message: string): WriteResult => ({ status: 400, body: { error: 'invalid_body', message } });
const notFound = (): WriteResult => ({ status: 404, body: { error: 'not_found', message: 'No such todo' } });
const ok = (row: unknown): WriteResult => ({ status: 200, body: { result: row } });

const save = async (db: PGlite, raw: unknown): Promise<WriteResult> => {
  const parsed = TodoSaveBody.safeParse(raw);
  if (!parsed.success) return bad(parsed.error.message);
  const { todo_id, title, notes, priority, due_date } = parsed.data;
  const res =
    todo_id === null
      ? await db.query(
          'INSERT INTO todos (title, notes, priority, due_date) VALUES ($1, $2, $3, $4) RETURNING *',
          [title, notes, priority, due_date],
        )
      : await db.query(
          'UPDATE todos SET title = $2, notes = $3, priority = $4, due_date = $5 WHERE id = $1 RETURNING *',
          [todo_id, title, notes, priority, due_date],
        );
  const row: unknown = res.rows[0];
  return row === undefined ? notFound() : ok(row);
};

const setDone = async (db: PGlite, raw: unknown): Promise<WriteResult> => {
  const parsed = TodoSetDoneBody.safeParse(raw);
  if (!parsed.success) return bad(parsed.error.message);
  const { todo_id, done } = parsed.data;
  // `done_at` is stamped by the endpoint — completing sets it, reopening
  // clears it. A form never carries it.
  const res = await db.query(
    'UPDATE todos SET done = $2, done_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1 RETURNING *',
    [todo_id, done],
  );
  const row: unknown = res.rows[0];
  return row === undefined ? notFound() : ok(row);
};

const remove = async (db: PGlite, raw: unknown): Promise<WriteResult> => {
  const parsed = TodoDeleteBody.safeParse(raw);
  if (!parsed.success) return bad(parsed.error.message);
  const res = await db.query('DELETE FROM todos WHERE id = $1 RETURNING id', [parsed.data.todo_id]);
  const row: unknown = res.rows[0];
  return row === undefined ? notFound() : ok(row);
};

const HANDLERS: Record<string, (db: PGlite, raw: unknown) => Promise<WriteResult>> = {
  '/api/todos/save': save,
  '/api/todos/set-done': setDone,
  '/api/todos/delete': remove,
};

// Resolve a write path to its handler; undefined → not a write endpoint.
export const handleWrite = async (db: PGlite, path: string, raw: unknown): Promise<WriteResult | undefined> => {
  const handler = HANDLERS[path];
  return handler !== undefined ? handler(db, raw) : undefined;
};
