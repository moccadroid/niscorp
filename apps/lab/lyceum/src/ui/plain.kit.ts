import type { DomComponent } from '@niscorp/nova/adapters/dom';
import type { Kit } from './kit.props';
import { LEVELS, Qr as PosterQr, SIGILS, clearsOnEnter, oneOf, records, text, tickDown } from './kit';

// ═══════════════════════════════════════════════════════════════
// THE PLAIN KIT — the same grammar (./kit.props.ts) as the poster, painted as
// unstyled semantic HTML: no stylesheet, no class names, the browser's own
// defaults. The trees the server sends do not change; only what each component
// name becomes here. Geometry (a sheet's areas, a cell's ink) is dropped — a
// document has none — and every piece of content stays.
// ═══════════════════════════════════════════════════════════════

const el = (tag: string, children: Node[] = []): HTMLElement => {
  const node = document.createElement(tag);
  for (const child of children) node.appendChild(child);
  return node;
};

const say = (tag: string, value: string): HTMLElement => {
  const node = el(tag);
  node.textContent = value;
  return node;
};

const Page: DomComponent = ({ children }) => el('div', children);
const Sheet: DomComponent = ({ children }) => el('div', children);
const Cell: DomComponent = ({ children }) => el('div', children);
const Label: DomComponent = ({ children }) => el('p', [el('strong', children)]);

const Headline: DomComponent = ({ props, children }) => {
  const level = oneOf(props['level'], LEVELS) ?? 'title';
  return el(level === 'display' ? 'h1' : level === 'title' ? 'h2' : 'h3', children);
};

const Text: DomComponent = ({ children }) => el('p', children);

const Figure: DomComponent = ({ props }) => el('dl', [say('dt', text(props['label']) ?? ''), say('dd', text(props['value']) ?? '—')]);

const Countdown: DomComponent = ({ props }) => {
  const value = el('dd');
  const node = el('dl', [say('dt', text(props['label']) ?? ''), value]);
  tickDown(node, value, props['to']);
  return node;
};

// Marked lines are <mark>ed.
const Code: DomComponent = ({ props }) => {
  const marked = new Set(Array.isArray(props['marked']) ? props['marked'].filter((n): n is number => typeof n === 'number') : []);
  const code = el('code');
  (text(props['text']) ?? '').split('\n').forEach((line, i) => {
    code.appendChild(marked.has(i + 1) ? say('mark', line) : document.createTextNode(line));
    code.appendChild(document.createTextNode('\n'));
  });
  return el('pre', [code]);
};

// A shape, as the character that draws it.
const GLYPHS: Record<(typeof SIGILS)[number], string> = { triangle: '▲', circle: '●', square: '■', cross: '✚' };
const Sigil: DomComponent = ({ props }) => {
  const shape = oneOf(props['shape'], SIGILS);
  const node = say('span', shape === undefined ? '' : GLYPHS[shape]);
  if (shape !== undefined) node.setAttribute('aria-label', shape);
  return node;
};

// The code must still scan: the poster's drawing, given a size of its own.
const Qr: DomComponent = (input) => {
  const node = PosterQr(input);
  node.removeAttribute('class');
  node.querySelector('svg')?.setAttribute('width', '240');
  return node;
};

const Rows: DomComponent = ({ props, dispatch }) => {
  const columns = records(props['columns']);
  const rowRef = text(props['rowRef']);
  const clickKey = text(props['clickKey']) ?? text(props['rowKey']) ?? '';
  const body = records(props['rows']).map((record) => {
    const row = el(
      'tr',
      columns.map((column) => {
        const value = record[text(column['key']) ?? ''];
        const cell = el('td');
        const kind = oneOf(column['kind'], ['text', 'mono', 'sigil'] as const) ?? 'text';
        if (kind === 'sigil') {
          const shape = oneOf(value, SIGILS);
          cell.textContent = shape === undefined ? '' : GLYPHS[shape];
        } else if (value === null || value === undefined || value === '') cell.textContent = text(column['missing']) ?? '';
        else cell.appendChild(kind === 'mono' ? say('code', text(value) ?? '') : document.createTextNode(text(value) ?? ''));
        return cell;
      }),
    );
    const key = record[clickKey];
    if (props['selected'] !== undefined && props['selected'] !== null && key === props['selected']) row.setAttribute('aria-selected', 'true');
    if (rowRef !== undefined) row.addEventListener('click', () => dispatch({ type: 'ui:click', ref: rowRef, payload: key }));
    return row;
  });
  if (body.length === 0) return el('p', [say('em', text(props['empty']) ?? '')]);
  const labelled = columns.some((column) => (text(column['label']) ?? '') !== '');
  const head = labelled ? [el('thead', [el('tr', columns.map((column) => say('th', text(column['label']) ?? '')))])] : [];
  return el('table', [...head, el('tbody', body)]);
};

// Proportions, as the numbers they are.
const Bar: DomComponent = ({ props }) =>
  say(
    'p',
    records(props['segments'])
      .map((segment) => text(segment['value']) ?? '')
      .filter((value) => value !== '')
      .join(' · '),
  );

const Action: DomComponent = ({ props }) => {
  const node = say('button', text(props['label']) ?? '');
  node.setAttribute('type', 'button');
  return node;
};

const Field: DomComponent = ({ props }) => {
  const node = document.createElement('input');
  node.type = 'text';
  node.autocomplete = 'off';
  const value = text(props['value']);
  if (value !== undefined) node.value = value;
  const placeholder = text(props['placeholder']);
  if (placeholder !== undefined) node.placeholder = placeholder;
  clearsOnEnter(node, props['enter']);
  return node;
};

const Look: DomComponent = () => el('span');

export const PLAIN_KIT: Kit = { Page, Sheet, Cell, Label, Headline, Text, Figure, Countdown, Code, Sigil, Qr, Rows, Bar, Action, Field, Look };
