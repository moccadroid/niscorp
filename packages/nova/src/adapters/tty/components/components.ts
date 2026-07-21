import type { TtyBlock, TtyComponent } from '../index';
import { str, bool, stack, inline, inlineText, truncate, pad, indent } from './props';

// ═══════════════════════════════════════════════════════════
// The TTY reference kit — the same domain-blind vocabulary as the DOM kit
// (same names, same props), interpreted for a line terminal. Interpretation
// is the target's freedom: a Row joins single-line children inline, a Table
// aligns padded columns, an Input prints `⟨value⟩`. What a terminal can't do
// it doesn't fake — layout weights, colors, and drag are simply absent.
// Unmapped names fall back to their children (fallback), so any app's tree
// still renders its content.
// ═══════════════════════════════════════════════════════════

// ── containers: the terminal's only axis is vertical, so Box and Stack
// stack; Row and Grid join inline while their children are single lines.
export const Box: TtyComponent = ({ children }) => stack(children);
export const Stack: TtyComponent = ({ children }) => stack(children);
export const Row: TtyComponent = ({ children }) => inline(children);
export const Grid: TtyComponent = ({ children }) => inline(children);

export const Text: TtyComponent = ({ props, children }) => {
  const block = inline(children, ' ');
  return bool(props, 'upper') ? { lines: block.lines.map((line) => line.toUpperCase()) } : block;
};

// A button is its label in parens — the renderer's `[n]` marker makes it
// actionable; this just makes it legible.
export const Button: TtyComponent = ({ props, children }) => {
  const label = inlineText(children);
  const icon = str(props, 'icon');
  const text = label !== '' ? label : icon !== undefined ? icon : '';
  return { lines: [`(${text})`] };
};

export const Input: TtyComponent = ({ props }) => {
  const raw = props['value'];
  const value = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  const shown = str(props, 'type') === 'password' ? '•'.repeat(value.length) : value;
  const placeholder = str(props, 'placeholder') ?? '';
  return { lines: [`⟨${shown !== '' ? shown : placeholder}⟩`] };
};

export const Textarea: TtyComponent = ({ props }) => {
  const raw = props['value'];
  const value = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  if (value === '') return { lines: [`⟨${str(props, 'placeholder') ?? ''}⟩`] };
  return { lines: value.split('\n').map((line) => `⟨ ${line}`) };
};

export const Checkbox: TtyComponent = ({ props }) => ({
  lines: [bool(props, 'value') || bool(props, 'checked') ? '☑' : '☐'],
});

export const Badge: TtyComponent = ({ children }) => {
  const text = inlineText(children);
  return { lines: text === '' ? [] : [`‹${text}›`] };
};

// ── the data-driven table: padded columns, a `[n]` marker per row when
// `rowRef` is set (the marker column keeps the grid aligned).

// Dotted-path field access, same as the DOM kit. Exported for the ink kit,
// which shares the table's data contract but renders focusable rows.
export const at = (row: unknown, key: string): unknown => {
  let cursor: unknown = row;
  for (const segment of key.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = Reflect.get(cursor, segment);
  }
  return cursor;
};
export const cellText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

type Column = { label?: unknown; cell?: { key?: unknown } };

export const columnsOf = (props: Record<string, unknown>): Column[] => {
  const value = props['columns'];
  if (!Array.isArray(value)) return [];
  const out: Column[] = [];
  for (const item of value) if (item !== null && typeof item === 'object') out.push(item);
  return out;
};
export const cellKey = (column: Column): string => (typeof column.cell?.key === 'string' ? column.cell.key : '');

const CELL_CAP = 28;

export const Table: TtyComponent = ({ props, register }) => {
  const columns = columnsOf(props);
  const rows = Array.isArray(props['rows']) ? props['rows'] : [];
  const rowKey = str(props, 'rowKey') ?? 'id';
  const clickKey = str(props, 'clickKey') ?? rowKey;
  const rowRef = str(props, 'rowRef');

  if (rows.length === 0) return { lines: [str(props, 'empty') ?? 'Nothing here.'] };

  const header = columns.map((column) => (typeof column.label === 'string' ? column.label : ''));
  const body = rows.map((row) => columns.map((column) => truncate(cellText(at(row, cellKey(column))), CELL_CAP)));
  const widths = header.map((label, i) => Math.max(truncate(label, CELL_CAP).length, ...body.map((cells) => cells[i]?.length ?? 0)));

  // Register every row first so the marker column width is known before any
  // line is laid out — markers pad to the widest ('[9] ' vs '[12] ').
  const markers = rowRef === undefined
    ? rows.map(() => '')
    : rows.map((row, i) => `[${register({ kind: 'row', ref: rowRef, label: body[i]?.[0] ?? rowRef, value: at(row, clickKey) })}] `);
  const markerWidth = Math.max(0, ...markers.map((marker) => marker.length));

  const layout = (marker: string, cells: string[]): string =>
    (marker.padStart(markerWidth) + cells.map((cell, i) => pad(cell, widths[i] ?? 0)).join('  ')).trimEnd();

  return {
    lines: [
      layout(''.padStart(markerWidth), header.map((label, i) => pad(label, widths[i] ?? 0))),
      layout(''.padStart(markerWidth), widths.map((width) => '─'.repeat(width))),
      ...body.map((cells, i) => layout(markers[i] ?? '', cells)),
    ],
  };
};

// Panel — a framed block with an optional title rule; `backRef`/`closeRef`
// register as `←`/`✕` interactives in the header, same prop-ref convention
// as Table's rowRef.
export const Panel: TtyComponent = ({ props, children, register }) => {
  const title = str(props, 'title');
  const lines: string[] = [];
  if (title !== undefined) {
    const parts: string[] = [];
    const backRef = str(props, 'backRef');
    if (backRef !== undefined) parts.push(`[${register({ kind: 'click', ref: backRef, label: '← back' })}] ←`);
    parts.push(title);
    const closeRef = str(props, 'closeRef');
    if (closeRef !== undefined) parts.push(`[${register({ kind: 'click', ref: closeRef, label: '✕ close' })}] ✕`);
    const head = `┌─ ${parts.join(' ')} `;
    lines.push(head + '─'.repeat(Math.max(0, 48 - head.length)));
  }
  lines.push(...indent(stack(children), title === undefined ? '' : '│ ').lines);
  return { lines };
};

// JsonTree — the value printed as an indented tree, depth- and width-capped
// so a devtools state dump stays readable instead of scrolling forever.
const DEPTH_CAP = 4;
const ENTRY_CAP = 20;

const jsonLines = (value: unknown, key: string | undefined, depth: number): string[] => {
  const pfx = '  '.repeat(depth);
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value) ? value.map((item, i): [string, unknown] => [String(i), item] ) : Object.entries(value);
    const shape = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
    // container summary is `key {N}` — colon is for leaves, same as the DOM kit
    const summary = key === undefined ? shape : `${key} ${shape}`;
    if (depth >= DEPTH_CAP) return [`${pfx}${summary} …`];
    const shown = entries.slice(0, ENTRY_CAP);
    return [
      `${pfx}${summary}`,
      ...shown.flatMap(([childKey, childValue]) => jsonLines(childValue, childKey, depth + 1)),
      ...(entries.length > ENTRY_CAP ? [`${'  '.repeat(depth + 1)}… +${entries.length - ENTRY_CAP} more`] : []),
    ];
  }
  return [`${pfx}${key === undefined ? '' : `${key}: `}${JSON.stringify(value)}`];
};

export const JsonTree: TtyComponent = ({ props }) => ({ lines: jsonLines(props['value'], str(props, 'label'), 0) });

// The per-instance boundary marker a flattened shell tree carries — the TTY
// target has no wrapper concept, so it passes the content straight through.
export const ActionSlot: TtyComponent = ({ children }) => stack(children);

// Unmapped primitives (an app's own NavItem, KanbanBoard, …) render their
// children — content shows, and a `ref` still gets its marker from the
// renderer. When a prop-driven component carries NO children, surface its
// primary text prop (label / title) plus a `count` — a legible degrade, not
// a full port; what the terminal can't do, it doesn't fake.
export const fallback: TtyComponent = ({ props, children }) => {
  const block = stack(children);
  if (block.lines.length > 0) return block;
  const label = str(props, 'label') ?? str(props, 'title');
  if (label === undefined) return { lines: [] };
  const count = props['count'];
  const suffix = typeof count === 'number' || (typeof count === 'string' && count !== '') ? ` (${String(count)})` : '';
  return { lines: [`${label}${suffix}`] };
};

export type { TtyBlock };
