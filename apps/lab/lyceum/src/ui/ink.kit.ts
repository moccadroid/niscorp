import { Children, createElement, useEffect, useState } from 'react';
import { Box, Text as InkText } from 'ink';
import { renderUnicodeCompact } from 'uqr';
import { Input, Mark, useActionable } from '@niscorp/nova/adapters/ink';
import { createComponentRegistry } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { KitOf } from './kit.props';
import { INKS, LEVELS, MARKS, SIGILS, oneOf, records, text } from './kit';

const h = createElement;

const COLOUR: Record<(typeof INKS)[number], string | undefined> = {
  paper: undefined,
  ink: 'white',
  signal: '#1400ff',
  alert: '#ff3b00',
  live: '#00c853',
  highlight: '#ffe600',
};

const Page: NovaComponent = ({ children }) => h(Box, { flexDirection: 'column' }, children);

const Sheet: NovaComponent = ({ children }) =>
  h(
    Box,
    { flexDirection: 'column' },
    Children.toArray(children).map((child, index) =>
      h(Box, { key: index, flexDirection: 'column', borderStyle: 'single', borderTop: index > 0, borderBottom: false, borderLeft: false, borderRight: false, borderDimColor: true }, child),
    ),
  );

const Cell: NovaComponent = ({ children, ...props }) => {
  const ink = oneOf(props['ink'], INKS);
  const colour = ink === undefined ? undefined : COLOUR[ink];
  const marked = oneOf(props['mark'], MARKS) !== undefined;
  const rule = colour !== undefined || marked;
  return h(
    Box,
    {
      flexDirection: 'column',
      paddingX: 1,
      ...(rule ? { borderStyle: colour === undefined ? 'single' : 'bold', borderTop: false, borderBottom: false, borderRight: false, borderDimColor: colour === undefined } : {}),
      ...(colour === undefined ? {} : { borderColor: colour }),
    },
    children,
  );
};

const Label: NovaComponent = ({ children }) => h(InkText, { bold: true, dimColor: true }, children);

const Headline: NovaComponent = ({ children, ...props }) => {
  const level = oneOf(props['level'], LEVELS) ?? 'title';
  return h(InkText, { bold: true, ...(level === 'display' ? { color: 'white' } : {}) }, children);
};

const Text: NovaComponent = ({ children, ...props }) => h(InkText, { dimColor: props['tone'] === 'muted' }, children);

const Figure: NovaComponent = ({ ...props }) =>
  h(Box, { gap: 1 }, h(InkText, { dimColor: true }, text(props['label']) ?? ''), h(InkText, { bold: true }, text(props['value']) ?? '—'));

const instantOf = (value: string | undefined): number =>
  value === undefined ? Number.NaN : Date.parse(value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
const Countdown: NovaComponent = ({ ...props }) => {
  const to = instantOf(text(props['to']));
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (Number.isNaN(to)) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [to]);
  const seconds = Math.ceil(Math.max(0, to - now) / 1000);
  const value = Number.isNaN(to) ? '—' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return h(Box, { gap: 1 }, h(InkText, { dimColor: true }, text(props['label']) ?? ''), h(InkText, { bold: true }, value));
};

const Code: NovaComponent = ({ ...props }) => {
  const marked = new Set(Array.isArray(props['marked']) ? props['marked'].filter((n): n is number => typeof n === 'number') : []);
  return h(
    Box,
    { flexDirection: 'column' },
    (text(props['text']) ?? '').split('\n').map((line, i) => h(InkText, { key: i, inverse: marked.has(i + 1) }, line === '' ? ' ' : line)),
  );
};

const GLYPHS: Record<(typeof SIGILS)[number], string> = { triangle: '▲', circle: '●', square: '■', cross: '✚', check: '✔', x: '✖' };
const Sigil: NovaComponent = ({ ...props }) => {
  const shape = oneOf(props['shape'], SIGILS);
  return shape === undefined ? null : h(InkText, {}, GLYPHS[shape]);
};

const Qr: NovaComponent = ({ ...props }) => {
  const value = text(props['value']) ?? '';
  return value === '' ? null : h(InkText, {}, renderUnicodeCompact(value));
};

// nova's terminal Table speaks a different grammar (`cell.key`), so it is not
// borrowed.
const CELL_CAP = 32;
const cellOf = (record: Record<string, unknown>, column: Record<string, unknown>): string => {
  const value = record[text(column['key']) ?? ''];
  if (value === null || value === undefined || value === '') return text(column['missing']) ?? '';
  const kind = oneOf(column['kind'], ['text', 'mono', 'sigil'] as const) ?? 'text';
  if (kind === 'sigil') {
    const shape = oneOf(value, SIGILS);
    return shape === undefined ? '' : GLYPHS[shape];
  }
  const said = typeof value === 'object' ? JSON.stringify(value) : (text(value) ?? String(value));
  return said.length > CELL_CAP ? `${said.slice(0, CELL_CAP - 1)}…` : said;
};

const PressableRow: NovaComponent = ({ ...props }) => {
  const rowRef = text(props['rowRef']);
  const { marker, isFocused } = useActionable(rowRef, props['payload']);
  return h(InkText, {}, h(Mark, { index: marker }), h(InkText, { inverse: isFocused || props['selected'] === true }, text(props['line']) ?? ''));
};

const Rows: NovaComponent = ({ ...props }) => {
  const columns = records(props['columns']);
  const body = records(props['rows']);
  if (body.length === 0) return h(InkText, { dimColor: true }, text(props['empty']) ?? '');
  const rowRef = text(props['rowRef']);
  const clickKey = text(props['clickKey']) ?? text(props['rowKey']) ?? '';
  const header = columns.map((column) => text(column['label']) ?? '');
  const cells = body.map((record) => columns.map((column) => cellOf(record, column)));
  const widths = header.map((label, i) => Math.max(label.length, ...cells.map((row) => row[i]?.length ?? 0)));
  const line = (row: string[]): string => row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ').trimEnd();
  const labelled = header.some((label) => label !== '');
  return h(
    Box,
    { flexDirection: 'column' },
    labelled ? h(InkText, { dimColor: true, bold: true }, line(header)) : null,
    cells.map((row, i) => {
      const key = body[i]?.[clickKey];
      return rowRef === undefined
        ? h(InkText, { key: i }, line(row))
        : h(PressableRow, { key: i, rowRef, payload: key, line: line(row), selected: props['selected'] !== undefined && props['selected'] !== null && key === props['selected'] });
    }),
  );
};

const BAR_CELLS = 40;
const Bar: NovaComponent = ({ ...props }) => {
  const segments = records(props['segments']).filter((segment) => typeof segment['value'] === 'number' && segment['value'] > 0);
  const total = segments.reduce((sum, segment) => sum + (typeof segment['value'] === 'number' ? segment['value'] : 0), 0);
  return h(
    InkText,
    {},
    segments.map((segment, i) => {
      const value = typeof segment['value'] === 'number' ? segment['value'] : 0;
      const ink = oneOf(segment['ink'], INKS);
      const colour = ink === undefined ? undefined : COLOUR[ink];
      return h(InkText, { key: i, ...(colour === undefined ? {} : { color: colour }) }, '█'.repeat(Math.max(1, Math.round((value / total) * BAR_CELLS))));
    }),
  );
};

const Flow: NovaComponent = ({ ...props }) =>
  h(
    Box,
    { flexDirection: 'column' },
    h(InkText, { bold: true }, `${text(props['from']) ?? ''}  ⇄  ${text(props['to']) ?? ''}`),
    records(props['lanes']).map((lane, i) => {
      const ink = oneOf(lane['ink'], INKS);
      const colour = ink === undefined ? undefined : COLOUR[ink];
      return h(InkText, { key: i, ...(colour === undefined ? {} : { color: colour }) }, `${lane['toward'] === 'from' ? '  <── ' : '  ──> '}${text(lane['label']) ?? ''}`);
    }),
  );

const Columns: NovaComponent = ({ ...props }) => {
  const bars = records(props['bars']);
  const most = Math.max(1, ...bars.map((bar) => (typeof bar['value'] === 'number' ? bar['value'] : 0)));
  return h(
    Box,
    { flexDirection: 'column' },
    bars.map((bar, i) => {
      const value = typeof bar['value'] === 'number' ? bar['value'] : 0;
      const ink = oneOf(bar['ink'], INKS);
      const colour = ink === undefined ? undefined : COLOUR[ink];
      return h(InkText, { key: i }, `${(text(bar['label']) ?? '').padEnd(12)} `, h(InkText, colour === undefined ? {} : { color: colour }, '█'.repeat(Math.round((value / most) * BAR_CELLS))), ` ${value}`);
    }),
  );
};

const Action: NovaComponent = ({ novaRef, ...props }) => {
  const { marker, isFocused } = useActionable(novaRef, props['value']);
  const ink = oneOf(props['ink'], INKS);
  const colour = ink === undefined || ink === 'paper' ? undefined : COLOUR[ink];
  return h(
    Box,
    { flexShrink: 0 },
    h(InkText, {}, h(Mark, { index: marker }), h(InkText, { inverse: isFocused, bold: true, ...(colour === undefined ? {} : { color: colour }) }, `( ${text(props['label']) ?? ''} )`)),
  );
};

const Field: NovaComponent = (props) => h(Input, props);

const Look: NovaComponent = () => null;
const Xray: NovaComponent = () => null;
const Menu: NovaComponent = ({ children }) => h(Box, { flexDirection: 'column' }, children);

export const INK_KIT: KitOf<NovaComponent> = { Page, Sheet, Cell, Label, Headline, Text, Figure, Countdown, Code, Sigil, Qr, Rows, Bar, Flow, Columns, Action, Field, Look, Xray, Menu };

// moss's ink target adds the wire-backed slots (ActionSlot, CanvasSlot) itself.
export const lyceumInkRegistry = (): ComponentRegistry<NovaComponent> => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll(INK_KIT);
  return registry;
};
