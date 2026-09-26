import { encode } from 'uqr';
import type { DomComponent } from '@niscorp/nova/adapters/dom';

// ═══════════════════════════════════════════════════════════════
// LYCEUM'S KIT — the only renderer code in the app (AGENTS.md, layout of an
// app). Domain-blind: no component knows a house, a slide or a member.
//
// CONFIGURED, NEVER STYLED. A layout says what a thing is — which grid area it
// fills, which ink, which mark — from closed sets of names; there is no `style`,
// no `className`, no colour and no size a layout can pass. An unknown value is
// dropped to the default rather than passed through: a model that writes
// `ink: 'purple'` gets paper, not purple. The look is ./tokens.ts, entirely.
//
// Geometry is the one thing a component turns into CSS itself — a sheet's
// named areas and column weights, a bar's proportions — because it is data
// (names and numbers), not style.
// ═══════════════════════════════════════════════════════════════

export const INKS = ['paper', 'ink', 'signal', 'alert', 'live', 'highlight'] as const;
export const MARKS = ['stripes', 'dots', 'bars', 'checks', 'hatch'] as const;
export const SIGILS = ['triangle', 'circle', 'square', 'cross'] as const;
export const ALIGNS = ['start', 'end', 'center', 'between'] as const;
export const LEVELS = ['display', 'title', 'name'] as const;
const AREA = /^[a-z][a-z0-9-]*$/;

const oneOf = <T extends string>(value: unknown, options: readonly T[]): T | undefined =>
  options.find((option) => option === value);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item)) : [];

const weight = (value: unknown): number | undefined => (typeof value === 'number' && value > 0 && value <= 100 ? value : undefined);

const el = (tag: string, className: string, children: Node[] = []): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  for (const child of children) node.appendChild(child);
  return node;
};

const setData = (node: HTMLElement, key: string, value: string | undefined): void => {
  if (value !== undefined) node.setAttribute(`data-${key}`, value);
};

const placeIn = (node: HTMLElement, area: unknown): void => {
  const name = text(area);
  if (name !== undefined && AREA.test(name)) node.style.gridArea = name;
};

// ── Page — the frame: canvases stacked, the last one filling the screen ──
export const Page: DomComponent = ({ children }) => el('div', 'page', children);

// ── Sheet — the ruled grid ──────────────────────────────────────
// areas: rows of area names, e.g. ['kick kick count', 'head head count'] — the
//        screen, drawn in words. `.` leaves a place empty (it shows as rule).
// cols:  one weight per column (default: equal). rows: one per row, a weight
//        or 'auto' (default: 'auto' for all but the last, which takes the rest
//        when the sheet fills).
// size:  'fill' takes the height it is given (a slide, a phone); 'auto' is as
//        tall as its content (a strip).
// narrow: { areas, rows?, cols? } — the arrangement on a phone-width screen,
//        in the same words. A cell whose area it leaves out is not shown there.
type Template = { areas: string; rows: string; cols: string; names: Set<string> } | undefined;

const templateOf = (areasProp: unknown, rowsProp: unknown, colsProp: unknown, size: 'fill' | 'auto'): Template => {
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

export const Sheet: DomComponent = ({ props, children }) => {
  const node = el('div', 'sheet', children);
  const size = oneOf(props['size'], ['fill', 'auto'] as const) ?? 'auto';
  setData(node, 'size', size);
  const wide = templateOf(props['areas'], props['rows'], props['cols'], size);
  if (wide === undefined) {
    node.style.gridTemplateColumns = '1fr';
    node.style.gridTemplateRows = size === 'fill' ? '1fr' : 'auto';
  } else {
    node.style.gridTemplateAreas = wide.areas;
    node.style.gridTemplateColumns = wide.cols;
    node.style.gridTemplateRows = wide.rows;
  }
  const narrowProp = props['narrow'];
  const narrow = typeof narrowProp === 'object' && narrowProp !== null && !Array.isArray(narrowProp)
    ? templateOf(Reflect.get(narrowProp, 'areas'), Reflect.get(narrowProp, 'rows'), Reflect.get(narrowProp, 'cols'), size)
    : undefined;
  if (narrow !== undefined) {
    node.setAttribute('data-narrow', '');
    node.style.setProperty('--narrow-areas', narrow.areas);
    node.style.setProperty('--narrow-rows', narrow.rows);
    node.style.setProperty('--narrow-cols', narrow.cols);
    for (const child of children) {
      if (child instanceof HTMLElement && child.style.gridArea !== '' && !narrow.names.has(child.style.gridArea.split(' ')[0] ?? '')) child.setAttribute('data-narrow-hidden', '');
    }
  }
  return node;
};

// ── Cell — a place in the grid ──────────────────────────────────
// area, ink (paper | ink | signal | alert | live | highlight), mark (stripes | dots | bars |
// checks | hatch), align (start | end | center | between), pad ('none'), scroll ('y' — a
// cell whose content may outgrow it scrolls inside it, and the sheet keeps its shape).
export const Cell: DomComponent = ({ props, children }) => {
  const node = el('div', 'cell', children);
  placeIn(node, props['area']);
  setData(node, 'ink', oneOf(props['ink'], INKS));
  setData(node, 'mark', oneOf(props['mark'], MARKS));
  setData(node, 'align', oneOf(props['align'], ALIGNS));
  setData(node, 'pad', oneOf(props['pad'], ['none'] as const));
  setData(node, 'scroll', oneOf(props['scroll'], ['y'] as const));
  return node;
};

// ── Label — the small spaced capitals ───────────────────────────
export const Label: DomComponent = ({ children }) => el('span', 'label', children);

// ── Headline — what is read from the back row ───────────────────
// level: display (the one thing on a slide) | title | name.
export const Headline: DomComponent = ({ props, children }) => {
  const level = oneOf(props['level'], LEVELS) ?? 'title';
  const node = el(level === 'display' ? 'h1' : 'h2', 'headline', children);
  setData(node, 'level', level);
  return node;
};

// ── Text — sentences ────────────────────────────────────────────
export const Text: DomComponent = ({ props, children }) => {
  const node = el('p', 'text', children);
  setData(node, 'tone', oneOf(props['tone'], ['muted'] as const));
  return node;
};

// ── Figure — a number, and what it counts ───────────────────────
export const Figure: DomComponent = ({ props }) => {
  const label = el('span', 'label');
  label.textContent = text(props['label']) ?? '';
  const value = el('span', 'value');
  value.textContent = text(props['value']) ?? '—';
  return el('div', 'figure', [label, value]);
};

// ── Code — mono, with the lines that matter marked ──────────────
// text: the source; marked: 1-based line numbers to mark.
export const Code: DomComponent = ({ props }) => {
  const marked = new Set(Array.isArray(props['marked']) ? props['marked'].filter((n): n is number => typeof n === 'number') : []);
  const lines = (text(props['text']) ?? '').split('\n').map((line, i) => {
    const node = el('span', '');
    node.textContent = line === '' ? ' ' : line;
    if (marked.has(i + 1)) node.setAttribute('data-marked', '');
    return node;
  });
  return el('div', 'code', lines);
};

// ── Sigil — a shape ─────────────────────────────────────────────
// shape: triangle | circle | square | cross. size: 'large' or text size.
const SVG = 'http://www.w3.org/2000/svg';
const SHAPES: Record<(typeof SIGILS)[number], { tag: string; attrs: Record<string, string> }[]> = {
  triangle: [{ tag: 'polygon', attrs: { points: '50,4 96,92 4,92' } }],
  circle: [{ tag: 'circle', attrs: { cx: '50', cy: '50', r: '46' } }],
  square: [{ tag: 'rect', attrs: { x: '6', y: '6', width: '88', height: '88' } }],
  cross: [
    { tag: 'rect', attrs: { x: '36', y: '4', width: '28', height: '92' } },
    { tag: 'rect', attrs: { x: '4', y: '36', width: '92', height: '28' } },
  ],
};

const sigil = (shape: unknown, large: boolean): HTMLElement => {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'sigil');
  svg.setAttribute('aria-hidden', 'true');
  if (large) svg.setAttribute('data-size', 'large');
  const known = oneOf(shape, SIGILS);
  for (const part of known === undefined ? [] : SHAPES[known]) {
    const node = document.createElementNS(SVG, part.tag);
    for (const [key, value] of Object.entries(part.attrs)) node.setAttribute(key, value);
    svg.appendChild(node);
  }
  const holder = el('span', '');
  holder.appendChild(svg);
  return holder;
};

export const Sigil: DomComponent = ({ props }) => sigil(props['shape'], props['size'] === 'large');

const withHead = (node: HTMLElement, head: boolean): HTMLElement => {
  if (head) node.setAttribute('data-head', '');
  return node;
};

// ── Qr — a value as a QR code ───────────────────────────────────
// value: what the code says (an address). Drawn as one SVG path of square
// modules with the standard quiet zone, ink on paper, as large as its place;
// the look decides the size. An empty value draws nothing.
export const Qr: DomComponent = ({ props }) => {
  const value = text(props['value']) ?? '';
  const holder = el('span', 'qr');
  if (value === '') return holder;
  const { data, size } = encode(value);
  const quiet = 4;
  const modules = data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x + quiet} ${y + quiet}h1v1h-1z`] : [])));
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size + quiet * 2} ${size + quiet * 2}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', value);
  const ground = document.createElementNS(SVG, 'rect');
  ground.setAttribute('width', '100%');
  ground.setAttribute('height', '100%');
  ground.setAttribute('class', 'qr-ground');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', modules.join(''));
  svg.append(ground, path);
  holder.appendChild(svg);
  return holder;
};

// ── Rows — a ruled table ────────────────────────────────────────
// rows: the records; rowKey: the id field; empty: what an empty table says.
// columns: [{ label, key, w?, kind?: 'text' | 'mono' | 'sigil', missing? }] —
// `missing` is what a cell says when its value is absent. Columns with no
// labels at all make a table with no header row (a list of lines).
export const Rows: DomComponent = ({ props, dispatch }) => {
  const columns = records(props['columns']);
  // A row you can press: `rowRef` names the click, `clickKey` the field its
  // payload is (default rowKey) — nova's own Table convention. `selected` marks
  // the row whose `clickKey` equals it.
  const rowRef = text(props['rowRef']);
  const clickKey = text(props['clickKey']) ?? text(props['rowKey']) ?? '';
  const selected = props['selected'];
  const cols = columns.map((column) => `${weight(column['w']) ?? 1}fr`).join(' ');
  const line = (cells: HTMLElement[]): HTMLElement => {
    const row = el('div', '', cells);
    row.style.setProperty('--cols', cols);
    return row;
  };
  const labelled = columns.some((column) => (text(column['label']) ?? '') !== '');
  const header = line(columns.map((column) => {
    const cell = el('span', '');
    cell.textContent = text(column['label']) ?? '';
    return cell;
  }));
  const head = labelled ? [header] : [];
  const body = records(props['rows']).map((record) => {
    const row = line(columns.map((column) => {
      const cell = el('span', '');
      const kind = oneOf(column['kind'], ['text', 'mono', 'sigil'] as const) ?? 'text';
      const value = record[text(column['key']) ?? ''];
      if (kind === 'sigil') {
        if (value !== null && value !== undefined) cell.appendChild(sigil(value, false));
      } else if (value === null || value === undefined || value === '') {
        cell.setAttribute('data-kind', 'missing');
        cell.textContent = text(column['missing']) ?? '';
      } else {
        cell.setAttribute('data-kind', kind);
        cell.textContent = text(value) ?? '';
      }
      return cell;
    }));
    const key = record[clickKey];
    if (selected !== undefined && selected !== null && key === selected) row.setAttribute('data-selected', '');
    if (rowRef !== undefined) {
      row.setAttribute('data-press', '');
      row.addEventListener('click', () => dispatch({ type: 'ui:click', ref: rowRef, payload: key }));
    }
    return row;
  });
  if (body.length === 0) {
    const empty = el('div', 'empty');
    empty.textContent = text(props['empty']) ?? '';
    return withHead(el('div', 'rows', [...head, empty]), labelled);
  }
  return withHead(el('div', 'rows', [...head, ...body]), labelled);
};

// ── Bar — proportions as cells ──────────────────────────────────
// segments: [{ value, ink?, mark? }].
export const Bar: DomComponent = ({ props }) => {
  const segments = records(props['segments']).filter((segment) => typeof segment['value'] === 'number' && segment['value'] > 0);
  const parts = segments.map((segment) => {
    const part = el('span', '');
    setData(part, 'ink', oneOf(segment['ink'], INKS));
    setData(part, 'mark', oneOf(segment['mark'], MARKS));
    return part;
  });
  const node = el('div', 'bar', parts);
  node.style.gridTemplateColumns = segments.map((segment) => `${text(segment['value']) ?? '1'}fr`).join(' ') || '1fr';
  return node;
};

// ── Action — a whole cell you press ─────────────────────────────
// area, ink, label, lines ('two' — the label always takes exactly two lines,
// clamped: a row of actions whose labels change keeps its height), size
// ('large' — the one thing a screen is for, like the door's Step in). Pressed, it
// is a `ui:click` on its `ref` (nova's convention — the renderer wires it, the
// component knows nothing of events).
export const Action: DomComponent = ({ props }) => {
  const label = el('span', '');
  label.textContent = text(props['label']) ?? '';
  const node = el('button', 'action', [label]);
  node.setAttribute('type', 'button');
  placeIn(node, props['area']);
  setData(node, 'ink', oneOf(props['ink'], INKS));
  setData(node, 'lines', oneOf(props['lines'], ['two'] as const));
  setData(node, 'size', oneOf(props['size'], ['large'] as const));
  return node;
};

// ── Field — a line of text somebody types ───────────────────────
// area, placeholder, value. Bound with the layout's `model` (nova wires the
// typing by that convention); `value` is what the field shows when it renders.
export const Field: DomComponent = ({ props }) => {
  const node = document.createElement('input');
  node.type = 'text';
  node.className = 'field';
  node.spellcheck = false;
  node.autocomplete = 'off';
  const value = text(props['value']);
  if (value !== undefined) node.value = value;
  const placeholder = text(props['placeholder']);
  if (placeholder !== undefined) node.placeholder = placeholder;
  placeIn(node, props['area']);
  return node;
};
