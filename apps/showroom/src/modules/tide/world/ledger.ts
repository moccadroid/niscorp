import { evaluate } from '@niscorp/prism';
import { zonedParts, type AdvanceReport, type Fact, type Run, type Task, type Tide, type TransformFn } from '@niscorp/tide';

// ═══════════════════════════════════════════════════════════
// What every tide page shares: the studio's clock, the driver loop, and a
// snapshot of the ledger — tide's own rows, read through `tide.ledger`, for
// the Ledger panel to print. Nothing here is simulated; it is the host's side
// of the seam, the part any app running tide writes once.
// ═══════════════════════════════════════════════════════════

export const TZ = 'Europe/Vienna';
export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

// Prism is the transform seam, the way moss wires it. The JSON round trip
// hands it plain data (tide's env can carry `undefined` fields).
export const transform: TransformFn = (config, source) => evaluate(config, JSON.parse(JSON.stringify(source)));

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const recordOf = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});
export const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

const moved = (r: AdvanceReport): number => r.materialized + r.factsMatched + r.runsCreated + r.tasksCreated + r.executed + r.runsSettled;

// The driver: advance to quiescence at one instant. A chain moves one hop per
// advance, so a host loops until a pass does nothing.
export const drain = async (tide: Tide, now: number): Promise<void> => {
  for (let pass = 0; pass < 40; pass += 1) {
    const r = await tide.advance({ now, limit: 500 });
    if (moved(r) === 0) return;
  }
};

// Walk the clock from `from` to `to`, waking exactly when tide says it next
// wants waking — the driver a real host runs, with the sleeping taken out.
// `stops` are instants the host itself has business at (a booking arriving);
// `onStop` runs at each, before the drain.
export const runUntil = async (tide: Tide, from: number, to: number, stops: readonly number[] = [], onStop?: (at: number) => Promise<void>): Promise<void> => {
  let now = from;
  await drain(tide, now);
  const pending = [...stops].filter((s) => s > from && s <= to).sort((a, b) => a - b);
  for (let guard = 0; guard < 2000; guard += 1) {
    const due = await tide.nextDue(now);
    const nextStop = pending[0];
    const candidates = [due, nextStop].filter((x): x is number => x !== undefined && x > now && x <= to);
    if (candidates.length === 0) break;
    now = Math.min(...candidates);
    if (nextStop !== undefined && now === nextStop) {
      pending.shift();
      if (onStop !== undefined) await onStop(now);
    }
    await drain(tide, now);
  }
  await drain(tide, to);
};

export type Snapshot = { facts: readonly Fact[]; runs: readonly Run[]; tasks: readonly Task[]; now: number };

export const EMPTY: Snapshot = { facts: [], runs: [], tasks: [], now: 0 };

// Newest first by the order rows were WRITTEN. The ledger already answers
// newest-first by `at`/`createdAt`, but a chain written in one instant ties on
// those — and the memory store's ids count up, so they break the tie honestly.
const seq = (id: string): number => Number(id.replace(/^\D+_/, '')) || 0;
const newestFirst = <T extends { id: string }>(rows: readonly T[]): readonly T[] => [...rows].sort((a, b) => seq(b.id) - seq(a.id));

export const readLedger = async (tide: Tide, now: number): Promise<Snapshot> => ({
  facts: newestFirst(await tide.ledger.facts({ limit: 200 })),
  runs: newestFirst(await tide.ledger.runs({ limit: 200 })),
  tasks: newestFirst(await tide.ledger.tasks({ limit: 400 })),
  now,
});

// ── time, as a person in Vienna reads it ─────────────────────────

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number): string => String(n).padStart(2, '0');

export const hhmm = (at: number): string => {
  const p = zonedParts(at, TZ);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};
export const dayName = (at: number): string => {
  const p = zonedParts(at, TZ);
  return DOW[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()] ?? '';
};
export const stamp = (at: number): string => `${dayName(at)} ${hhmm(at)}`;
export const localDate = (at: number): string => {
  const p = zonedParts(at, TZ);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
