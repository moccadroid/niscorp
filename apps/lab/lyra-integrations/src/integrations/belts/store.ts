export type Rank = { name: string; tone: string; color: string };

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
    next_stripe: stripes < 4 ? ordinal(stripes + 1) : '',
    can_undo: history.length > 0,
    undo_label: prior === undefined ? 'White' : labelFor(prior.belt, prior.stripes),
    history: history.map((entry) => ({ label: labelFor(entry.belt, entry.stripes), on: entry.on, bands: bandsFor(entry.belt, entry.stripes) })),
  };
};

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
