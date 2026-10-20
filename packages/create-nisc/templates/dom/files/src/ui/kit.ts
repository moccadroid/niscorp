import { z } from 'zod';
import type { DomComponent } from '@niscorp/nova/adapters/dom';

// nova's DOM adapter wires the clicks of an element with a `ref`, and the input
// and keys of one with a `model`, itself.

const parsed = <T>(schema: z.ZodType<T>, props: unknown, fallback: T): T => {
  const result = schema.safeParse(props);
  return result.success ? result.data : fallback;
};

const cell = (value: unknown): string => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

const element = (tag: string, className: string, children: Node[]): HTMLElement => {
  const el = document.createElement(tag);
  el.className = className;
  el.append(...children);
  return el;
};

const text = (value: unknown): Text => document.createTextNode(cell(value));

export const Page: DomComponent = ({ children }) => element('main', 'k-page', children);
export const Row: DomComponent = ({ children }) => element('div', 'k-row', children);
export const Heading: DomComponent = ({ children }) => element('h1', 'k-heading', children);

const TextProps = z.object({ tone: z.enum(['default', 'muted', 'strong', 'error']).optional() });
export const Text: DomComponent = ({ props, children }) => {
  const { tone } = parsed(TextProps, props, {});
  return element('p', tone === undefined || tone === 'default' ? 'k-text' : `k-text k-${tone}`, children);
};

const ButtonProps = z.object({ label: z.string().optional(), tone: z.enum(['primary', 'quiet']).optional() });
export const Button: DomComponent = ({ props, children }) => {
  const { label, tone } = parsed(ButtonProps, props, {});
  const button = element('button', tone === 'quiet' ? 'k-button k-quiet' : 'k-button', label !== undefined ? [text(label)] : children);
  button.setAttribute('type', 'button');
  return button;
};

export const Frame: DomComponent = ({ children }) => element('div', 'k-frame', children);
export const Bar: DomComponent = ({ children }) => element('header', 'k-bar', children);
export const Answers: DomComponent = ({ children }) => element('main', 'k-answers', children);

const AreaProps = z.object({ name: z.string() });
export const Area: DomComponent = ({ props, children }) => element('section', `k-area k-area-${parsed(AreaProps, props, { name: '' }).name}`, children);

const CardProps = z.object({ title: z.string().optional() });
export const Card: DomComponent = ({ props, children }) => {
  const { title } = parsed(CardProps, props, {});
  return element('article', 'k-card', [...(title !== undefined && title !== '' ? [element('h2', 'k-card-title', [text(title)])] : []), ...children]);
};

const TableProps = z.object({ columns: z.array(z.object({ key: z.string(), label: z.string() })), rows: z.array(z.record(z.string(), z.unknown())) });
export const Table: DomComponent = ({ props }) => {
  const { columns, rows } = parsed(TableProps, props, { columns: [], rows: [] });
  const head = element('thead', '', [element('tr', '', columns.map((column) => element('th', '', [text(column.label)])))]);
  const body = element('tbody', '', rows.map((row) => element('tr', '', columns.map((column) => element('td', '', [text(row[column.key])])))));
  return element('div', 'k-table-wrap', [element('table', 'k-table', [head, body])]);
};

const StatProps = z.object({ value: z.unknown(), label: z.string().optional() });
export const Stat: DomComponent = ({ props }) => {
  const { value, label } = parsed(StatProps, props, { value: '' });
  return element('div', 'k-stat', [element('strong', 'k-stat-value', [text(value)]), ...(label !== undefined ? [element('span', 'k-stat-label', [text(label)])] : [])]);
};

const BarsProps = z.object({ items: z.array(z.object({ label: z.unknown(), value: z.number() })) });
export const Bars: DomComponent = ({ props }) => {
  const { items } = parsed(BarsProps, props, { items: [] });
  const most = Math.max(1, ...items.map((item) => item.value));
  return element(
    'ul',
    'k-bars',
    items.map((item) => {
      const fill = element('span', 'k-bars-fill', []);
      fill.style.width = `${(item.value / most) * 100}%`;
      return element('li', 'k-bars-item', [element('span', 'k-bars-label', [text(item.label)]), element('span', 'k-bars-track', [fill]), element('span', 'k-bars-value', [text(item.value)])]);
    }),
  );
};

const InputProps = z.object({ placeholder: z.string().optional(), value: z.unknown().optional(), clearOnEnter: z.boolean().optional() });
// The one listener a component here adds: a line something is sent from empties itself on Enter. What was typed has
// already reached the shell, one `ui:model` a keystroke.
export const Input: DomComponent = ({ props }) => {
  const { placeholder, value, clearOnEnter } = parsed(InputProps, props, {});
  const input = document.createElement('input');
  input.className = 'k-input';
  if (placeholder !== undefined) input.placeholder = placeholder;
  input.value = cell(value);
  if (clearOnEnter === true) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.value = '';
    });
  }
  return input;
};

export const Prompt: DomComponent = ({ children }) => element('footer', 'k-prompt', children);

const FieldProps = z.object({ label: z.string() });
export const Field: DomComponent = ({ props, children }) => element('label', 'k-field', [element('span', 'k-field-label', [text(parsed(FieldProps, props, { label: '' }).label)]), ...children]);
