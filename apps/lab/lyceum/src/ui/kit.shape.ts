import { encode } from 'uqr';

// ═══════════════════════════════════════════════════════════════
// WHAT EVERY BROWSER KIT WORKS OUT THE SAME WAY — the geometry a component
// turns into CSS itself, the countdown's arithmetic, the shapes, the QR code.
// Pure: strings and numbers in, strings and numbers out. The DOM kit (./kit.ts),
// the React kit (./react.kit.ts) and the Vue kit (./vue.kit.ts) build their
// elements from these, so the three draw the same thing from the same tree.
// ═══════════════════════════════════════════════════════════════

export const AREA = /^[a-z][a-z0-9-]*$/;

export const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;

export const weight = (value: unknown): number | undefined =>
  typeof value === 'number' && value > 0 && value <= 100 ? value : undefined;

export const areaOf = (value: unknown): string | undefined => {
  const name = text(value);
  return name !== undefined && AREA.test(name) ? name : undefined;
};

// ── a Sheet's grid, from its areas, rows and columns ──
export type Template = { areas: string; rows: string; cols: string; names: Set<string> };

export const templateOf = (
  areasProp: unknown,
  rowsProp: unknown,
  colsProp: unknown,
  size: 'fill' | 'auto',
): Template | undefined => {
  const rows = (Array.isArray(areasProp) ? areasProp : [])
    .map((row) => text(row)?.trim().split(/\s+/) ?? [])
    .filter((names) => names.length > 0 && names.every((name) => name === '.' || AREA.test(name)));
  const width = Math.max(0, ...rows.map((names) => names.length));
  if (rows.length === 0 || !rows.every((names) => names.length === width)) return undefined;
  const cols = Array.isArray(colsProp) ? colsProp.map(weight) : [];
  const declared = Array.isArray(rowsProp) ? rowsProp : [];
  return {
    areas: rows.map((names) => `"${names.join(' ')}"`).join(' '),
    cols: Array.from({ length: width }, (_, i) => `${cols[i] ?? 1}fr`).join(' '),
    rows: rows
      .map((_, i) => {
        const row = declared[i];
        if (row === 'auto') return 'auto';
        const w = weight(row);
        if (w !== undefined) return `${w}fr`;
        return size === 'fill' && i === rows.length - 1 ? '1fr' : 'auto';
      })
      .join(' '),
    names: new Set(rows.flat()),
  };
};

// The narrow arrangement a Sheet declares, if it declares one.
export const narrowOf = (narrowProp: unknown, size: 'fill' | 'auto'): Template | undefined =>
  typeof narrowProp === 'object' && narrowProp !== null && !Array.isArray(narrowProp)
    ? templateOf(
        Reflect.get(narrowProp, 'areas'),
        Reflect.get(narrowProp, 'rows'),
        Reflect.get(narrowProp, 'cols'),
        size,
      )
    : undefined;

// A Sheet's own CSS: the wide grid, and the narrow one as custom properties the
// stylesheet switches to on a phone-width screen.
export const sheetStyle = (
  wide: Template | undefined,
  narrow: Template | undefined,
  size: 'fill' | 'auto',
): Record<string, string> => ({
  ...(wide === undefined
    ? { gridTemplateColumns: '1fr', gridTemplateRows: size === 'fill' ? '1fr' : 'auto' }
    : {
        gridTemplateAreas: wide.areas,
        gridTemplateColumns: wide.cols,
        gridTemplateRows: wide.rows,
      }),
  ...(narrow === undefined
    ? {}
    : {
        '--narrow-areas': narrow.areas,
        '--narrow-rows': narrow.rows,
        '--narrow-cols': narrow.cols,
      }),
});

// ── the countdown ──
// The instant, from ISO or Postgres's own "YYYY-MM-DD HH:MM:SS+ZZ".
export const instantOf = (value: string | undefined): number =>
  value === undefined
    ? Number.NaN
    : Date.parse(value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));

// What a countdown shows now: the time left as m:ss, whether it is done, and
// whether it is still running (a dash for no instant at all).
export const remaining = (
  to: number,
  now: number,
): { shown: string; done: boolean; running: boolean } => {
  if (Number.isNaN(to)) return { shown: '—', done: false, running: false };
  const seconds = Math.ceil(Math.max(0, to - now) / 1000);
  return {
    shown: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    done: seconds === 0,
    running: seconds > 0,
  };
};

// ── the shapes ──
export const SIGIL_SHAPES: Record<
  'triangle' | 'circle' | 'square' | 'cross',
  { tag: string; attrs: Record<string, string> }[]
> = {
  triangle: [{ tag: 'polygon', attrs: { points: '50,4 96,92 4,92' } }],
  circle: [{ tag: 'circle', attrs: { cx: '50', cy: '50', r: '46' } }],
  square: [{ tag: 'rect', attrs: { x: '6', y: '6', width: '88', height: '88' } }],
  cross: [
    { tag: 'rect', attrs: { x: '36', y: '4', width: '28', height: '92' } },
    { tag: 'rect', attrs: { x: '4', y: '36', width: '92', height: '28' } },
  ],
};

// ── the QR code: one path of square modules, with the standard quiet zone ──
export const qrOf = (value: string): { viewBox: string; d: string } => {
  const { data, size } = encode(value);
  const quiet = 4;
  const modules = data.flatMap((row, y) =>
    row.flatMap((dark, x) => (dark ? [`M${x + quiet} ${y + quiet}h1v1h-1z`] : [])),
  );
  return { viewBox: `0 0 ${size + quiet * 2} ${size + quiet * 2}`, d: modules.join('') };
};

// ── Flow: where on the wall clock a lane's dots are ──
export const FLOW_PERIOD_MS = 2400;
export const flowDelays = (now: number): string[] => {
  const phase = -(now % FLOW_PERIOD_MS);
  return [0, 1, 2].map((i) => `${phase - (i * FLOW_PERIOD_MS) / 3}ms`);
};
