// Curated, deterministic seed. Every date hangs off a FIXED reference day —
// `TODAY_ISO` — so the date-relative reads (overdue, due today) are stable on
// every boot and every day the demo runs. The runtime injects the same value
// as ambient `$.today`; nothing anywhere compares to the wall clock.

export const TODAY_ISO = '2026-06-20';

const TODAY = new Date(`${TODAY_ISO}T12:00:00.000Z`);
const dayMs = 86_400_000;
const dateOffset = (days: number): string => new Date(TODAY.getTime() + days * dayMs).toISOString().slice(0, 10);
const tsOffset = (days: number): string => new Date(TODAY.getTime() + days * dayMs).toISOString();

type Val = string | number | boolean | null;
const lit = (v: Val): string => {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${v.replace(/'/g, "''")}'`;
};

type TodoSeed = {
  id: string;
  title: string;
  notes: string | null;
  priority: 'low' | 'medium' | 'high';
  due: number | null; // days from TODAY
  done: boolean;
  doneAt: number | null; // days from TODAY
  createdAt: number; // days from TODAY (negative)
};

// A believable week: three overdue, two due today, a handful upcoming, two
// dateless, three done. The dev checks assert against these buckets.
const TODOS: TodoSeed[] = [
  { id: 'todo_001', title: 'Renew the domain', notes: 'It expires silently; the registrar will not warn twice.', priority: 'high', due: -12, done: false, doneAt: null, createdAt: -30 },
  { id: 'todo_002', title: 'Return library books', notes: null, priority: 'medium', due: -4, done: false, doneAt: null, createdAt: -18 },
  { id: 'todo_003', title: 'File the expense report', notes: 'Q2 receipts are in the drawer.', priority: 'low', due: -1, done: false, doneAt: null, createdAt: -9 },
  { id: 'todo_004', title: 'Water the plants', notes: null, priority: 'low', due: 0, done: false, doneAt: null, createdAt: -6 },
  { id: 'todo_005', title: 'Send the invoice to Arcadia', notes: 'Net 30, PO #4471.', priority: 'high', due: 0, done: false, doneAt: null, createdAt: -3 },
  { id: 'todo_006', title: 'Book the dentist appointment', notes: null, priority: 'medium', due: 3, done: false, doneAt: null, createdAt: -14 },
  { id: 'todo_007', title: 'Draft the talk outline', notes: 'Twenty minutes plus questions.', priority: 'medium', due: 6, done: false, doneAt: null, createdAt: -7 },
  { id: 'todo_008', title: 'Rotate the backup drives', notes: null, priority: 'low', due: 10, done: false, doneAt: null, createdAt: -21 },
  { id: 'todo_009', title: 'Plan the summer trip', notes: 'Trains, not planes.', priority: 'low', due: 21, done: false, doneAt: null, createdAt: -11 },
  { id: 'todo_010', title: 'Learn the accordion', notes: 'Someday.', priority: 'low', due: null, done: false, doneAt: null, createdAt: -28 },
  { id: 'todo_011', title: 'Clean out the garage', notes: null, priority: 'medium', due: null, done: false, doneAt: null, createdAt: -16 },
  { id: 'todo_012', title: 'Pay the electricity bill', notes: null, priority: 'medium', due: -8, done: true, doneAt: -7, createdAt: -20 },
  { id: 'todo_013', title: 'Ship the birthday present', notes: 'Wrap it first.', priority: 'high', due: -3, done: true, doneAt: -3, createdAt: -12 },
  { id: 'todo_014', title: 'Update the router firmware', notes: null, priority: 'low', due: null, done: true, doneAt: -1, createdAt: -25 },
];

// Seed buckets, exported so the dev checks assert against the same source of
// truth the seed was built from.
export const SEED_COUNTS = {
  open: TODOS.filter((t) => !t.done).length,
  dueToday: TODOS.filter((t) => !t.done && t.due === 0).length,
  overdue: TODOS.filter((t) => !t.done && t.due !== null && t.due < 0).length,
  today: TODOS.filter((t) => !t.done && t.due !== null && t.due <= 0).length,
  done: TODOS.filter((t) => t.done).length,
};

export const buildSeedSql = (): string => {
  const rows = TODOS.map((t) => {
    const vals: Val[] = [
      t.id,
      t.title,
      t.notes,
      t.priority,
      t.due !== null ? dateOffset(t.due) : null,
      t.done,
      t.doneAt !== null ? tsOffset(t.doneAt) : null,
      tsOffset(t.createdAt),
    ];
    return `(${vals.map(lit).join(', ')})`;
  });
  return `INSERT INTO todos (id, title, notes, priority, due_date, done, done_at, created_at) VALUES\n  ${rows.join(',\n  ')};\n`;
};
