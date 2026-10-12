import type { DomComponent } from '../index';
import { boxStyle, flexStyle, gridStyle, textStyle, css, str, num, bool, iconGlyph } from './props';

const elem = (tag: string, children: Node[]): HTMLElement => {
  const node = document.createElement(tag);
  for (const child of children) node.appendChild(child);
  return node;
};

export const Box: DomComponent = ({ props, children }) => {
  const el = elem('div', children);
  css(el, boxStyle(props));
  return el;
};

export const Row: DomComponent = ({ props, children }) => {
  const el = elem('div', children);
  css(el, { ...flexStyle(props, 'row'), ...boxStyle(props) });
  return el;
};

export const Stack: DomComponent = ({ props, children }) => {
  const el = elem('div', children);
  css(el, { ...flexStyle(props, 'column'), ...boxStyle(props) });
  return el;
};

export const Grid: DomComponent = ({ props, children }) => {
  const el = elem('div', children);
  css(el, { ...gridStyle(props), ...boxStyle(props) });
  return el;
};

export const Text: DomComponent = ({ props, children }) => {
  const el = elem(str(props, 'as') ?? 'span', children);
  css(el, textStyle(props));
  return el;
};

export const Button: DomComponent = ({ props, children }) => {
  const el = elem('button', children);
  const icon = str(props, 'icon');
  if (children.length === 0 && icon !== undefined) el.textContent = iconGlyph(icon);
  const variant = str(props, 'variant');
  if (variant !== undefined) el.setAttribute('data-variant', variant);
  const size = str(props, 'size');
  if (size !== undefined) el.setAttribute('data-size', size);
  return el;
};

const inputEl = (props: Record<string, unknown>): HTMLInputElement => {
  const el = document.createElement('input');
  el.type = str(props, 'type') ?? 'text';
  const placeholder = str(props, 'placeholder');
  if (placeholder !== undefined) el.placeholder = placeholder;
  const value = props['value'];
  if (typeof value === 'string' || typeof value === 'number') el.value = String(value);
  const width = num(props, 'w') ?? num(props, 'width');
  if (width !== undefined) el.style.setProperty('width', `${width}px`);
  return el;
};

export const Input: DomComponent = ({ props }) => inputEl(props);

export const Checkbox: DomComponent = ({ props }) => {
  const el = document.createElement('input');
  el.type = 'checkbox';
  el.checked = bool(props, 'value') || bool(props, 'checked');
  return el;
};

export const Textarea: DomComponent = ({ props }) => {
  const el = document.createElement('textarea');
  const value = props['value'];
  if (typeof value === 'string' || typeof value === 'number') el.value = String(value);
  return el;
};

const at = (row: unknown, key: string): unknown => {
  let cursor: unknown = row;
  for (const segment of key.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = Reflect.get(cursor, segment);
  }
  return cursor;
};
const cellText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

type Column = { label?: unknown; cell?: { key?: unknown } };

const columnsOf = (props: Record<string, unknown>): Column[] => {
  const value = props['columns'];
  if (!Array.isArray(value)) return [];
  const out: Column[] = [];
  for (const item of value) if (item !== null && typeof item === 'object') out.push(item);
  return out;
};
const cellKey = (column: Column): string => (typeof column.cell?.key === 'string' ? column.cell.key : '');

export const Table: DomComponent = ({ props, dispatch }) => {
  const columns = columnsOf(props);
  const rows = Array.isArray(props['rows']) ? props['rows'] : [];
  const rowKey = str(props, 'rowKey') ?? 'id';
  const clickKey = str(props, 'clickKey') ?? rowKey;
  const rowRef = str(props, 'rowRef');

  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const column of columns) {
    const th = document.createElement('th');
    th.textContent = typeof column.label === 'string' ? column.label : '';
    headRow.appendChild(th);
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const body = document.createElement('tbody');
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.setAttribute('colspan', String(Math.max(1, columns.length)));
    td.textContent = str(props, 'empty') ?? 'Nothing here.';
    tr.appendChild(td);
    body.appendChild(tr);
  } else {
    for (const row of rows) {
      const tr = document.createElement('tr');
      for (const column of columns) {
        const td = document.createElement('td');
        td.textContent = cellText(at(row, cellKey(column)));
        tr.appendChild(td);
      }
      if (rowRef !== undefined) {
        tr.setAttribute('data-row', '');
        tr.addEventListener('click', () => dispatch({ type: 'ui:click', ref: rowRef, payload: at(row, clickKey) }));
      }
      body.appendChild(tr);
    }
  }
  table.appendChild(body);
  return table;
};

export const Panel: DomComponent = ({ props, children, dispatch }) => {
  const el = document.createElement('div');
  el.setAttribute('data-panel', '');
  const title = str(props, 'title');
  if (title !== undefined) {
    const head = document.createElement('div');
    head.setAttribute('data-panel-title', '');
    const backRef = str(props, 'backRef');
    if (backRef !== undefined) {
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = '←';
      back.addEventListener('click', (e) => {
        e.stopPropagation();
        dispatch({ type: 'ui:click', ref: backRef });
      });
      head.appendChild(back);
    }
    head.appendChild(document.createTextNode(title));
    const closeRef = str(props, 'closeRef');
    if (closeRef !== undefined) {
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '✕';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        dispatch({ type: 'ui:click', ref: closeRef });
      });
      head.appendChild(close);
    }
    el.appendChild(head);
  }
  for (const child of children) el.appendChild(child);
  return el;
};

const jsonNode = (value: unknown, key: string | undefined): HTMLElement => {
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value) ? value.map((item, i): [string, unknown] => [String(i), item]) : Object.entries(value);
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const shape = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
    summary.textContent = key === undefined ? shape : `${key} ${shape}`;
    details.appendChild(summary);
    const body = document.createElement('div');
    body.setAttribute('data-json-body', '');
    for (const [childKey, childValue] of entries) body.appendChild(jsonNode(childValue, childKey));
    details.appendChild(body);
    return details;
  }
  const leaf = document.createElement('div');
  leaf.setAttribute('data-json-leaf', '');
  leaf.textContent = key === undefined ? JSON.stringify(value) : `${key}: ${JSON.stringify(value)}`;
  return leaf;
};

export const JsonTree: DomComponent = ({ props }) => {
  const el = document.createElement('div');
  el.setAttribute('data-json', '');
  el.appendChild(jsonNode(props['value'], str(props, 'label')));
  return el;
};

export const ActionSlot: DomComponent = ({ children }) => elem('div', children);

export const fallback: DomComponent = ({ props, children }) => {
  const el = elem('div', children);
  if (children.length > 0) return el;
  // Not `name` (an icon or a field id) and not `value`: neither is a display string.
  const label = str(props, 'label') ?? str(props, 'title');
  if (label !== undefined) el.appendChild(document.createTextNode(label));
  const count = props['count'];
  if (typeof count === 'number' || (typeof count === 'string' && count !== '')) {
    const badge = document.createElement('span');
    badge.setAttribute('data-count', '');
    badge.textContent = String(count);
    el.appendChild(badge);
  }
  return el;
};
