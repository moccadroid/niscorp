// ── THE STORAGE THIS PACK BRINGS WITH IT ─────────────────────
//
// In-memory here because it is a lab; a real one would have a database. What
// matters is that it is NOT Lyra's: rows are keyed by the membership id handed
// over at the wire, and Lyra has no column for any of this.
//
// NOTHING OUTSIDE THIS PACK IMPORTS THIS FILE. That is the isolation rule, and
// it is why the state moved out of the shared serve.ts: two packs sharing a
// module is two packs sharing a bug.
//
// RANKS are configuration — the pack's own settings screen edits them, which is
// what a settings screen IS: rows in the pack's storage, never Lyra's.
//
// A rank carries its COLOR, because what a belt looks like is this pack's
// domain knowledge: Lyra's kit knows how to paint colored bands, never what a
// grappling belt is. `bandsFor` is the whole tradition in one line — the belt
// body with the rank bar near the end (color·color·color·bar·color), the bar
// black on every belt and RED on the black belt, exactly as a gym would tie it.
export type Rank = { name: string; tone: string; color: string };

// A RANK IS AN IDENTITY. These carried status tones — brown was 'alert', black
// was 'good' — so the pack was telling the host app that a brown belt is a
// problem and a black belt is a success. The bands are the real colour; the
// token is only for a badge, and it names a hue now.
export const RANKS: Rank[] = [
  { name: 'White', tone: 'stone', color: '#e9e7e2' },
  { name: 'Blue', tone: 'sky', color: '#2458d6' },
  { name: 'Purple', tone: 'violet', color: '#6d3bbf' },
  { name: 'Brown', tone: 'amber', color: '#6b4226' },
  { name: 'Black', tone: 'stone', color: '#141416' },
];

const BAR = '#141416';
const BLACK_BELT_BAR = '#b3261e';
const TAPE = '#f5f5f4';

// The belt as a gym would tie it: the body, then the rank bar — twice as wide
// as a body segment so the tape reads — carrying up to four stripes, then the
// tail. Black belts wear the red bar; their stripes are degrees.
export const bandsFor = (belt: string, stripes = 0): unknown[] => {
  const rank = RANKS.find((r) => r.name === belt);
  if (rank === undefined) return [];
  const bar = belt === 'Black' ? BLACK_BELT_BAR : BAR;
  return [rank.color, rank.color, rank.color, { color: bar, w: 2, ticks: Math.max(0, Math.min(4, stripes)), tickColor: TAPE }, rank.color];
};

export const toneOf = (belt: string): string => RANKS.find((r) => r.name === belt)?.tone ?? 'neutral';

export const nextRank = (belt: string): string | null => {
  const at = RANKS.findIndex((r) => r.name === belt);
  if (at === -1) return RANKS[0]?.name ?? null;
  return RANKS[at + 1]?.name ?? null;
};

export const ordinal = (n: number): string => ['', '1st', '2nd', '3rd', '4th'][n] ?? `${n}th`;
export const labelFor = (belt: string, stripes: number): string => (stripes > 0 ? `${belt} — ${ordinal(stripes)} stripe` : belt);

// STRIPES ARE STATE, PROMOTIONS ARE EVENTS. A record holds where somebody is
// (belt + 0..4 stripes); the history holds every moment that moved them —
// gradings AND stripe advancements, each with the belt as it looked that day.
export type BeltEvent = { belt: string; stripes: number; on: string };
export type BeltRecord = { personId: string; studioId: string; belt: string; stripes: number; since: string; classes: number; history: BeltEvent[] };

export const BELTS: BeltRecord[] = [
  {
    personId: 'p_omar', studioId: 'st_northrock', belt: 'Purple', stripes: 2, since: '2024-11-02', classes: 412,
    history: [
      { belt: 'Purple', stripes: 2, on: '2026-02-14' },
      { belt: 'Purple', stripes: 1, on: '2025-06-01' },
      { belt: 'Purple', stripes: 0, on: '2024-11-02' },
      { belt: 'Blue', stripes: 0, on: '2022-03-19' },
      { belt: 'White', stripes: 0, on: '2019-09-01' },
    ],
  },
  {
    personId: 'p_nina', studioId: 'st_northrock', belt: 'Blue', stripes: 1, since: '2025-06-14', classes: 188,
    history: [
      { belt: 'Blue', stripes: 1, on: '2026-04-03' },
      { belt: 'Blue', stripes: 0, on: '2025-06-14' },
      { belt: 'White', stripes: 0, on: '2023-01-11' },
    ],
  },
  {
    personId: 'p_ruben', studioId: 'st_northrock', belt: 'White', stripes: 3, since: '2026-05-06', classes: 31,
    history: [
      { belt: 'White', stripes: 3, on: '2026-08-01' },
      { belt: 'White', stripes: 2, on: '2026-07-04' },
      { belt: 'White', stripes: 1, on: '2026-06-06' },
      { belt: 'White', stripes: 0, on: '2026-05-06' },
    ],
  },
];

// THERE IS NO UNRANKED. Walking onto the mat is walking on as a white belt —
// a member with no record here IS a white belt with no stripes, and the first
// stripe or promotion is what mints the row.
//
// The answer every belt-shaped endpoint gives: where they are, what is next,
// whether a stripe can still be added (four is the wall), and every belt —
// current and historical — travelling with its `bands`, so a screen paints it
// without knowing what one is.
export const beltView = (held: BeltRecord | undefined) => {
  const belt = held?.belt ?? 'White';
  const stripes = held?.stripes ?? 0;
  const history = held?.history ?? [];
  const prior = history[1];
  return {
    belt,
    stripes,
    label: labelFor(belt, stripes),
    bands: bandsFor(belt, stripes),
    since: held?.since ?? '—',
    classes: held?.classes ?? 0,
    next: nextRank(belt),
    can_stripe: stripes < 4,
    // The words the panel's confirmations speak, authored here beside the
    // rules they describe — a screen should never do rank arithmetic.
    next_stripe: stripes < 4 ? ordinal(stripes + 1) : '',
    // EVERY EDIT IS REVERSIBLE, because the history is a ledger: undo pops the
    // newest event and the record becomes whatever the ledger then says —
    // all the way down to the white-belt floor.
    can_undo: history.length > 0,
    undo_label: prior === undefined ? 'White' : labelFor(prior.belt, prior.stripes),
    history: history.map((entry) => ({ label: labelFor(entry.belt, entry.stripes), on: entry.on, bands: bandsFor(entry.belt, entry.stripes) })),
  };
};

// The current belt's start date, read off the ledger: the OLDEST entry of the
// newest-first run that still wears this belt is the day it was tied on.
export const sinceFor = (history: BeltEvent[]): string => {
  const current = history[0];
  if (current === undefined) return '—';
  let on = current.on;
  for (const entry of history) {
    if (entry.belt !== current.belt) break;
    on = entry.on;
  }
  return on;
};
