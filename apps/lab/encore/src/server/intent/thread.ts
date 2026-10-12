import { z } from 'zod';
import type { FetchFn } from '@niscorp/nova';
import type { Message } from '@niscorp/signal';
import { threadAppend, threadTurns } from '@encore/app/vex/thread.entries';

// Turns go over the session's wire: the engine stamps the principal on every insert and fences
// every read to it. Appends are serialised and a read waits for them, so a turn stored as a
// sentence is left is in the thread the next sentence's run reads.

export const THREAD_WINDOW_TURNS = 20;

export type TurnRole = 'operator' | 'jev' | 'agent' | 'did' | 'event' | 'break';

export type TurnRow = { seq: number; role: TurnRole; body: string; detail: string };

export type RailEntry = { key: string; by: string; tone: string; line: string; said: string; full: string };

export type RememberedRow = { table: string; id: string; label: string };

const RowSchema = z.object({ seq: z.number(), role: z.enum(['operator', 'jev', 'agent', 'did', 'event', 'break']), body: z.string(), detail: z.string() });

const DetailSchema = z.object({ rail: z.string().optional(), followUps: z.array(z.string()).optional(), rows: z.array(z.object({ table: z.string(), id: z.string(), label: z.string() })).optional() }).loose();

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
  rows: () => Promise<TurnRow[]>;
  window: () => Promise<Message[]>;
  entries: () => Promise<RailEntry[]>;
  remembered: () => Promise<RememberedRow[]>;
  asked: () => Promise<string[]>;
  flushed: () => Promise<void>;
};

const post = (wire: FetchFn, fingerprint: string, context: Record<string, unknown>): ReturnType<FetchFn> =>
  wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context }) });

const lastTurns = (rows: readonly TurnRow[], turns: number): TurnRow[] => {
  const starts = rows.flatMap((row, index) => (row.role === 'operator' ? [index] : []));
  const from = starts.length <= turns ? 0 : (starts[starts.length - turns] ?? 0);
  return rows.slice(from);
};

export const messagesOf = (rows: readonly TurnRow[]): Message[] =>
  rows.flatMap((row): Message[] => {
    if (row.role === 'operator') return [{ role: 'user', content: row.body }];
    if (row.role === 'jev' || row.role === 'agent') return [{ role: 'assistant', content: row.body }];
    if (row.role === 'did') return [{ role: 'user', content: `${BUTTON_PRESSED} ${row.body}` }];
    if (row.role === 'event') return [{ role: 'user', content: `${EVENT_RAISED} ${row.body}` }];
    return [];
  });

export const BUTTON_PRESSED = '[button pressed]';
export const EVENT_RAISED = '[event, nobody asked]';

export const railOf = (rows: readonly TurnRow[]): RailEntry[] => {
  const entries: RailEntry[] = [];
  // An answer attaches to its line, not to whatever came last: a button or an event can land between.
  let asked: RailEntry | undefined;
  for (const row of rows) {
    const rail = detailOf(row).rail ?? '';
    if (row.role === 'operator') {
      asked = { key: String(row.seq), by: '', tone: 'mute', line: row.body, said: '', full: '' };
      entries.push(asked);
    } else if (row.role === 'did') entries.push({ key: String(row.seq), by: 'pressed', tone: 'good', line: row.body, said: '', full: row.body });
    else if (row.role === 'event') entries.push({ key: String(row.seq), by: 'event', tone: 'warn', line: row.body, said: '', full: rail === '' ? row.body : rail });
    else if (asked !== undefined && row.role === 'jev') Object.assign(asked, { by: 'cards', tone: 'mute', said: rail === '' ? row.body : rail, full: rail === '' ? row.body : rail });
    else if (asked !== undefined && row.role === 'agent') Object.assign(asked, row.body.startsWith(CARDS_ONLY) ? { by: 'cards', tone: 'mute', said: rail === '' ? row.body : rail, full: rail === '' ? row.body : rail } : { by: 'agent', tone: 'accent', said: firstSentence(row.body), full: row.body });
  }
  return entries.reverse();
};

export const createThread = (wire: FetchFn): Thread => {
  let queue: Promise<void> = Promise.resolve();

  const read = async (): Promise<TurnRow[]> => {
    await queue;
    const response = await post(wire, threadTurns.fingerprint, {});
    if (!response.ok) return [];
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
    asked: async () => (await read()).flatMap((row) => (row.role === 'operator' ? [row.body] : row.role === 'agent' ? (detailOf(row).followUps ?? []) : [])),
    flushed: () => queue,
  };
};
