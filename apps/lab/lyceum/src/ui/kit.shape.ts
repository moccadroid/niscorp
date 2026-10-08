import { encode } from 'uqr';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';

// ═══════════════════════════════════════════════════════════════
// WHAT EVERY BROWSER KIT WORKS OUT THE SAME WAY — the geometry a component
// turns into CSS itself, the countdown's arithmetic, the shapes, the QR code,
// the lines of a document set in colour. Pure: strings and numbers in, strings
// and numbers out. The DOM kit (./kit.ts), the React kit (./react.kit.ts) and
// the Vue kit (./vue.kit.ts) build their elements from these, so the three draw
// the same thing from the same tree.
// ═══════════════════════════════════════════════════════════════

export const AREA = /^[a-z][a-z0-9-]*$/;

export const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;

export const numbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number') : [];

// ── code, set in colour ──
// The languages a document on a slide is written in. A line of one is set in
// colour by highlight.js — keywords, strings, numbers, comments, nothing else
// — and the kits put its markup where the line goes. Line by line, so a
// layout can mark the lines that matter (a token across lines loses its
// colour at the break, which a document on a slide does not have). Without a
// language the text is set as it is.
hljs.registerLanguage('json', json);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('ts', typescript);
export const LANGS = ['json', 'sql', 'ts'] as const;
export type Lang = (typeof LANGS)[number];

const escaped = (line: string): string => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type CodeLine = { text: string; html: string; marked: boolean };
export const codeLines = (source: string, lang: Lang | undefined, marked: readonly number[]): CodeLine[] =>
  source.split('\n').map((raw, i) => {
    const line = raw === '' ? ' ' : raw;
    return {
      text: line,
      html: lang === undefined ? escaped(line) : hljs.highlight(line, { language: lang, ignoreIllegals: true }).value,
      marked: marked.includes(i + 1),
    };
  });

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
        // A weighted row takes its share and no more: content taller than the
        // share clips inside its cell, and the sheet keeps the height it was
        // given — a slide never grows past the screen and pushes the strip off.
        const w = weight(row);
        if (w !== undefined) return `minmax(0, ${w}fr)`;
        return size === 'fill' && i === rows.length - 1 ? 'minmax(0, 1fr)' : 'auto';
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
  'triangle' | 'circle' | 'square' | 'cross' | 'check' | 'x',
  { tag: string; attrs: Record<string, string> }[]
> = {
  triangle: [{ tag: 'polygon', attrs: { points: '50,4 96,92 4,92' } }],
  circle: [{ tag: 'circle', attrs: { cx: '50', cy: '50', r: '46' } }],
  square: [{ tag: 'rect', attrs: { x: '6', y: '6', width: '88', height: '88' } }],
  cross: [
    { tag: 'rect', attrs: { x: '36', y: '4', width: '28', height: '92' } },
    { tag: 'rect', attrs: { x: '4', y: '36', width: '92', height: '28' } },
  ],
  // yes, and no
  check: [{ tag: 'polygon', attrs: { points: '4,54 22,36 40,54 78,12 96,30 40,90' } }],
  x: [{ tag: 'polygon', attrs: { points: '18,4 50,36 82,4 96,18 64,50 96,82 82,96 50,64 18,96 4,82 36,50 4,18' } }],
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

// ── Pipeline ────────────────────────────────────────────────────
// A line of steps that always run, and one detour under it that runs only
// sometimes. What every kit draws from: each step with its place, each link
// with whether it was walked, the detour with where it leaves the line and
// where it comes back. The link the detour stands in for is walked only when
// the detour was not.
export type PipelineStep = { label: string; value: string; note: string; ink: string | undefined; off: boolean };
export type PipelineShape = {
  steps: PipelineStep[];
  links: { off: boolean; label: string }[];
  detour: { from: number; to: number; off: boolean; back: boolean; label: string; enter: string; leave: string; steps: PipelineStep[] } | undefined;
  legend: { label: string; ink: string | undefined }[];
};
const rowsOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
const stepOf = (item: Record<string, unknown>): PipelineStep => ({ label: text(item['label']) ?? '', value: text(item['value']) ?? '', note: text(item['note']) ?? '', ink: text(item['ink']), off: item['off'] === true });
export const pipelineOf = (props: Record<string, unknown>): PipelineShape => {
  const steps = rowsOf(props['steps']).map(stepOf);
  const raw = props['detour'];
  const given = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
  // A place in the line, counted from 0 — the first step is one.
  const place = (value: unknown): number | undefined => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined);
  const from = place(given?.['from']);
  const to = place(given?.['to']);
  const inner = rowsOf(given?.['steps']).map(stepOf);
  const off = given?.['off'] === true;
  const detour =
    given === undefined || from === undefined || to === undefined || from < 0 || to <= from || to >= steps.length
      ? undefined
      : { from, to, off, back: !off && inner.length > 0 && inner.every((step) => !step.off), label: text(given['label']) ?? '', enter: text(given['enter']) ?? '', leave: text(given['leave']) ?? '', steps: inner };
  const links = steps.slice(1).map((step, index) => {
    const replaced = detour !== undefined && index === detour.from && detour.to === detour.from + 1;
    return { off: step.off || (steps[index]?.off ?? true) || (replaced && !detour.off), label: replaced ? (text(given?.['direct']) ?? '') : '' };
  });
  return { steps, links, detour, legend: rowsOf(props['legend']).map((item) => ({ label: text(item['label']) ?? '', ink: text(item['ink']) })) };
};
// The grid a pipeline is drawn on: a column a step, a narrow one a link.
export const pipelineColumns = (count: number): string => Array.from({ length: Math.max(count, 1) }, () => 'minmax(0, 1fr)').join(' 3rem ');
export const pipelineText = (shape: PipelineShape): string[] => {
  const said = (step: PipelineStep): string => `${step.label}: ${step.off ? 'not run' : [step.value, step.note].filter((part) => part !== '').join(', ')}`;
  return [shape.steps.map(said).join(' → '), ...(shape.detour === undefined || shape.detour.off ? [] : [`${shape.detour.label} — ${shape.detour.steps.map(said).join(' → ')}`])];
};
