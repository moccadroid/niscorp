import { z } from 'zod';
import type { DomComponent } from '@niscorp/nova/adapters/dom';

// nova's DOM adapter wires the clicks of an element with a `ref` (its `value` the payload), and the input and keys of
// one with a `model`, itself.

// A value a component does not take falls back to its default on its own; the others still hold.
const parsed = <S extends z.ZodRawShape>(schema: z.ZodObject<S>, props: Record<string, unknown>, fallback: z.output<z.ZodObject<S>>): z.output<z.ZodObject<S>> => {
  const taken = Object.fromEntries(
    Object.entries(props).filter(([key, value]) => {
      const field = schema.shape[key];
      return field !== undefined && z.safeParse(field, value).success;
    }),
  );
  const result = schema.safeParse({ ...fallback, ...taken });
  return result.success ? result.data : fallback;
};

const cell = (value: unknown): string => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

const element = (tag: string, className: string, children: Node[]): HTMLElement => {
  const el = document.createElement(tag);
  if (className !== '') el.className = className;
  el.append(...children);
  return el;
};

const text = (value: unknown): Text => document.createTextNode(cell(value));

const toned = (base: string, tone: string | undefined, plain: string): string => (tone === undefined || tone === plain ? base : `${base} k-${tone}`);

export const Page: DomComponent = ({ children }) => element('main', 'k-page', children);
export const Row: DomComponent = ({ children }) => element('div', 'k-row', children);
export const Heading: DomComponent = ({ children }) => element('h1', 'k-heading', children);

const TextProps = z.object({ tone: z.enum(['default', 'lead', 'muted', 'strong', 'display', 'right', 'wrong', 'error']).optional() });
export const Text: DomComponent = ({ props, children }) => element('p', toned('k-text', parsed(TextProps, props, {}).tone, 'default'), children);

const ButtonProps = z.object({ label: z.string().optional(), tone: z.enum(['primary', 'suggestion', 'link', 'choice', 'chosen', 'right', 'wrong', 'summary', 'step']).optional() });
export const Button: DomComponent = ({ props, children }) => {
  const { label, tone } = parsed(ButtonProps, props, {});
  const button = element('button', toned('k-button', tone, 'primary'), label !== undefined ? [text(label)] : children);
  button.setAttribute('type', 'button');
  return button;
};

export const Frame: DomComponent = ({ children }) => element('div', 'k-frame', children);
export const Dock: DomComponent = ({ children }) => element('footer', 'k-dock', children);
export const Menu: DomComponent = ({ children }) => element('nav', 'k-menu', children);

const GridProps = z.object({ columns: z.number().int().min(1).max(3).optional() });
export const Grid: DomComponent = ({ props, children }) => element('main', `k-grid k-columns-${parsed(GridProps, props, {}).columns ?? 2}`, children);

const AreaProps = z.object({ name: z.string(), span: z.number().int().min(1).max(3).optional(), changed: z.boolean().optional() });
export const Area: DomComponent = ({ props, children }) => {
  const { span, changed } = parsed(AreaProps, props, { name: '' });
  return element('section', `k-area k-span-${span ?? 1}${changed === true ? ' k-area-changed' : ''}`, children);
};

const CardProps = z.object({ title: z.string().optional(), tone: z.enum(['default', 'hero']).optional() });
export const Card: DomComponent = ({ props, children }) => {
  const { title, tone } = parsed(CardProps, props, {});
  return element('article', toned('k-card', tone, 'default'), [...(title !== undefined && title !== '' ? [element('h2', 'k-card-title', [text(title)])] : []), ...children]);
};

const CodeProps = z.object({ text: z.string() });
export const Code: DomComponent = ({ props }) => element('pre', 'k-code', [element('code', '', [text(parsed(CodeProps, props, { text: '' }).text)])]);

const PointsProps = z.object({ items: z.array(z.object({ title: z.string(), text: z.string() })) });
export const Points: DomComponent = ({ props }) =>
  element(
    'dl',
    'k-points',
    parsed(PointsProps, props, { items: [] }).items.map((item) => element('div', 'k-point', [element('dt', '', [text(item.title)]), element('dd', '', [text(item.text)])])),
  );

const StepsProps = z.object({ items: z.array(z.string()) });
export const Steps: DomComponent = ({ props }) => element('ol', 'k-steps', parsed(StepsProps, props, { items: [] }).items.map((item) => element('li', '', [text(item)])));

const CheckProps = z.object({ label: z.string(), checked: z.boolean().optional() });
export const Check: DomComponent = ({ props }) => {
  const { label, checked } = parsed(CheckProps, props, { label: '' });
  const box = element('span', 'k-box', []);
  box.setAttribute('aria-hidden', 'true');
  const check = element('button', checked === true ? 'k-check k-checked' : 'k-check', [box, element('span', 'k-check-label', [text(label)])]);
  check.setAttribute('type', 'button');
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(checked === true));
  return check;
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

export const Prompt: DomComponent = ({ children }) => element('div', 'k-prompt', children);
