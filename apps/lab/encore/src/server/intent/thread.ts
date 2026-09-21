import { z } from 'zod';
import type { FetchFn } from '@niscorp/nova';
import type { Message } from '@niscorp/signal';
import { threadAppend, threadTurns } from '@encore/app/vex/thread.entries';

// ═══════════════════════════════════════════════════════════
// THE THREAD — memory for the agent, none for Jev.
//
// ROWS, NOT PROCESS MEMORY. `agent_turns`, appended through a vex mutation
// entry and read back through a vex entry, both over the SESSION's wire: the
// engine stamps the principal on every insert and fences every read to it
// (app/vex/behaviors.ts), so a thread cannot be written on somebody else's
// behalf or read across two people — and it survives the process, which a
// history kept in a closure does not (relay says so, as debt).
//
// EVERY SETTLED SENTENCE IS A TURN, not only the ones the agent answered. The
// operator moves the headliner — Jev alone, no run — and then asks "is the tent
// free then?". The agent has to know what was just done. So a turn is stored
// with what EITHER speed made of it:
//
//   operator   the sentence, as typed — stored BEFORE a run starts, so a failed
//              or aborted reply still leaves the question behind;
//   jev        what the fast speed did with a sentence it handled alone: one
//              compact line, not a transcript of nothing;
//   agent      the agent's answer, and what it put on screen. An aborted run's
//              partial answer is never stored;
//   did        a button a PERSON pressed: a form was submitted. The one kind of
//              turn that is not a sentence — and the one the rail exists for;
//   break      the operator ended the thread. Nothing else ever does — the
//              room resets per sentence, the thread does not.
//
// THE SAME ROWS ARE THE RAIL. `entries()` folds them into one line per turn, in
// the operator's terms: a row's `detail.rail` is what it amounted to ("moved
// Nova Kestrel → The Tent, 21:00 · not submitted"), written when the row was,
// so the rail never re-derives history from a screen that has moved on.
//
// AND THE ROWS THE CONVERSATION HAS PUT ON THE TABLE. A row's `detail.rows` are
// the rows that turn resolved or was handed; `remembered()` is their union. A
// follow-up — "what are our options" — retrieves nothing of its own, and the
// agent answering it has to be able to name the act the last turn was about.
//
// THE WINDOW is the last twenty turns after the last break, whole, mapped to
// messages and handed to the run as its input. No summaries: a window, or
// nothing (DESIGN.md § Not built, on purpose).
//
// Appends are SERIALISED per session. A Jev-alone turn is flushed when its
// sentence is left, which is the same keystroke that may start the next
// sentence's run — and that run has to read a thread that already holds it.
// ═══════════════════════════════════════════════════════════

export const THREAD_WINDOW_TURNS = 20;

export type TurnRole = 'operator' | 'jev' | 'agent' | 'did' | 'event' | 'break';

export type TurnRow = { seq: number; role: TurnRole; body: string; detail: string };

// One line of the rail: a turn, folded. `line` is what was said (or done),
// `said` what came of it in a few words, `full` the whole of it for an opened
// entry. `key` is a string because it is what a click carries back.
export type RailEntry = { key: string; by: string; tone: string; line: string; said: string; full: string };

export type RememberedRow = { table: string; id: string; label: string };

const RowSchema = z.object({ seq: z.number(), role: z.enum(['operator', 'jev', 'agent', 'did', 'event', 'break']), body: z.string(), detail: z.string() });

const DetailSchema = z.object({ rail: z.string().optional(), rows: z.array(z.object({ table: z.string(), id: z.string(), label: z.string() })).optional() }).loose();

const detailOf = (row: TurnRow): z.infer<typeof DetailSchema> => {
  try {
    const parsed = DetailSchema.safeParse(JSON.parse(row.detail));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
};

const SAID_MAX_CHARS = 140;
const firstSentence = (text: string): string => {
  const end = text.search(/[.!?](\s|$)/);
  const sentence = end < 0 ? text : text.slice(0, end + 1);
  return sentence.length > SAID_MAX_CHARS ? `${sentence.slice(0, SAID_MAX_CHARS)}…` : sentence;
};

export const CARDS_ONLY = '[cards only]';

export type Thread = {
  append: (role: TurnRole, body: string, detail?: Record<string, unknown>) => Promise<void>;
  // The current thread's rows, oldest first: everything after the last break.
  rows: () => Promise<TurnRow[]>;
  // The run's input: the last THREAD_WINDOW_TURNS turns, as messages.
  window: () => Promise<Message[]>;
  // The rail, NEWEST FIRST.
  entries: () => Promise<RailEntry[]>;
  // Every row this thread has resolved or been handed, by table.
  remembered: () => Promise<RememberedRow[]>;
  // Every append so far has reached the database.
  flushed: () => Promise<void>;
};

const post = (wire: FetchFn, fingerprint: string, context: Record<string, unknown>): ReturnType<FetchFn> =>
  wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context }) });

// A turn starts at an operator row. The window is the last N of those and
// everything after the first of them.
const lastTurns = (rows: readonly TurnRow[], turns: number): TurnRow[] => {
  const starts = rows.flatMap((row, index) => (row.role === 'operator' ? [index] : []));
  const from = starts.length <= turns ? 0 : (starts[starts.length - turns] ?? 0);
  return rows.slice(from);
};

export const messagesOf = (rows: readonly TurnRow[]): Message[] =>
  rows.flatMap((row): Message[] => {
    if (row.role === 'operator') return [{ role: 'user', content: row.body }];
    if (row.role === 'jev' || row.role === 'agent') return [{ role: 'assistant', content: row.body }];
    // Not something anybody said — so it is marked as what it is.
    if (row.role === 'did') return [{ role: 'user', content: `${BUTTON_PRESSED} ${row.body}` }];
    // Something the room noticed by itself, with nobody typing: what "what did I
    // miss?" is answered from.
    if (row.role === 'event') return [{ role: 'user', content: `${EVENT_RAISED} ${row.body}` }];
    return [];
  });

export const BUTTON_PRESSED = '[button pressed]';
export const EVENT_RAISED = '[event, nobody asked]';

// One entry per turn: an operator line and whatever answered it, or a button.
export const railOf = (rows: readonly TurnRow[]): RailEntry[] => {
  const entries: RailEntry[] = [];
  // What answers a line attaches to THE LINE, not to whatever came last: a
  // button or an event can land between a question and its answer.
  let asked: RailEntry | undefined;
  for (const row of rows) {
    const rail = detailOf(row).rail ?? '';
    if (row.role === 'operator') {
      asked = { key: String(row.seq), by: '', tone: 'mute', line: row.body, said: '', full: '' };
      entries.push(asked);
    } else if (row.role === 'did') entries.push({ key: String(row.seq), by: 'pressed', tone: 'good', line: row.body, said: '', full: row.body });
    else if (row.role === 'event') entries.push({ key: String(row.seq), by: 'event', tone: 'warn', line: row.body, said: '', full: rail === '' ? row.body : rail });
    else if (asked !== undefined && row.role === 'jev') Object.assign(asked, { by: 'cards', tone: 'mute', said: rail === '' ? row.body : rail, full: rail === '' ? row.body : rail });
    else if (asked !== undefined && row.role === 'agent') Object.assign(asked, { by: 'agent', tone: 'accent', said: firstSentence(row.body), full: row.body });
  }
  return entries.reverse();
};

export const createThread = (wire: FetchFn): Thread => {
  let queue: Promise<void> = Promise.resolve();

  const read = async (): Promise<TurnRow[]> => {
    await queue;
    const response = await post(wire, threadTurns.fingerprint, {});
    if (!response.ok) return [];
    // The session wire unwraps vex's `{ result }`; rows arrive bare, NEWEST
    // FIRST (the entry sorts descending so its limit keeps the recent ones).
    const parsed = z.array(RowSchema).safeParse(await response.json());
    if (!parsed.success) return [];
    const newestFirst = parsed.data;
    const breakAt = newestFirst.findIndex((row) => row.role === 'break');
    return (breakAt < 0 ? newestFirst : newestFirst.slice(0, breakAt)).reverse();
  };

  return {
    append: (role, body, detail = {}) => {
      queue = queue
        .then(async () => {
          const response = await post(wire, threadAppend.fingerprint, { role, body, detail: JSON.stringify(detail) });
          if (!response.ok) console.error(`[encore/thread] a ${role} turn was not stored (${response.status}): ${(await response.text()).slice(0, 200)}`);
        })
        .catch((error: unknown) => console.error('[encore/thread] a turn was not stored:', error));
      return queue;
    },
    rows: read,
    window: async () => messagesOf(lastTurns(await read(), THREAD_WINDOW_TURNS)),
    entries: async () => railOf(await read()),
    remembered: async () => {
      const seen = new Map<string, RememberedRow>();
      for (const row of await read()) for (const found of detailOf(row).rows ?? []) seen.set(`${found.table}:${found.id}`, found);
      return [...seen.values()];
    },
    flushed: () => queue,
  };
};
