import { z } from 'zod';
import type { PGlite } from '@electric-sql/pglite';

// ───────────────────────────────────────────────────────────
// The write path (D4): thin handlers, parameterized SQL, Zod at
// the boundary. Identity-shaped derivation is stamped HERE, never
// client-supplied: `bloom` on create, `done_at`/`done_on` on done.
// ───────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const TodoPayloadSchema = z
  .object({
    title: z.string().trim().min(1, 'title is required').describe('Todo title.'),
    notes: z.string().default('').describe('Free-form notes.'),
    due_date: z
      .union([z.string().regex(ISO_DATE, 'due_date must be YYYY-MM-DD'), z.null()])
      .default(null)
      .describe('Due date as YYYY-MM-DD, or null for someday.'),
  })
  .strict();

export const DonePayloadSchema = z
  .object({ done: z.boolean().describe('true completes the todo, false replants it.') })
  .strict();

const IdSchema = z.uuid();

const BLOOMS = ['tulip', 'daisy', 'poppy', 'lotus', 'bell', 'fern'] as const;

export type WriteDeps = { db: PGlite; today: string };
export type HandlerResult = { status: number; body: unknown };

const invalid = (error: z.ZodError): HandlerResult => ({
  status: 400,
  body: { message: error.issues[0]?.message ?? 'invalid payload' },
});

const notFound: HandlerResult = { status: 404, body: { message: 'no such todo' } };

export const createTodo = async ({ db }: WriteDeps, body: unknown): Promise<HandlerResult> => {
  const parsed = TodoPayloadSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const bloom = BLOOMS[Math.floor(Math.random() * BLOOMS.length)] ?? 'daisy';
  const result = await db.query<{ id: string }>(
    'insert into todos (title, notes, due_date, bloom) values ($1, $2, $3, $4) returning id',
    [parsed.data.title, parsed.data.notes, parsed.data.due_date, bloom],
  );
  const created = result.rows[0];
  if (created === undefined) return { status: 500, body: { message: 'insert returned no row' } };
  return { status: 201, body: { todo_id: created.id, bloom } };
};

export const updateTodo = async ({ db }: WriteDeps, id: string, body: unknown): Promise<HandlerResult> => {
  if (!IdSchema.safeParse(id).success) return notFound;
  const parsed = TodoPayloadSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const result = await db.query(
    'update todos set title = $2, notes = $3, due_date = $4 where id = $1',
    [id, parsed.data.title, parsed.data.notes, parsed.data.due_date],
  );
  if ((result.affectedRows ?? 0) === 0) return notFound;
  return { status: 200, body: { todo_id: id } };
};

export const setTodoDone = async ({ db, today }: WriteDeps, id: string, body: unknown): Promise<HandlerResult> => {
  if (!IdSchema.safeParse(id).success) return notFound;
  const parsed = DonePayloadSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const result = parsed.data.done
    ? await db.query('update todos set done = true, done_at = now(), done_on = $2 where id = $1', [id, today])
    : await db.query('update todos set done = false, done_at = null, done_on = null where id = $1', [id]);
  if ((result.affectedRows ?? 0) === 0) return notFound;
  return { status: 200, body: { todo_id: id, done: parsed.data.done } };
};

export const deleteTodo = async ({ db }: WriteDeps, id: string): Promise<HandlerResult> => {
  if (!IdSchema.safeParse(id).success) return notFound;
  const result = await db.query('delete from todos where id = $1', [id]);
  if ((result.affectedRows ?? 0) === 0) return notFound;
  return { status: 200, body: { todo_id: id } };
};
