import { z } from 'zod';
import type { DomComponent } from '@niscorp/nova/adapters/dom';

// nova's DOM adapter wires the clicks of an element with a `ref` itself, so
// `Button` adds no listener.

const parsed = <T>(schema: z.ZodType<T>, props: unknown, fallback: T): T => {
  const result = schema.safeParse(props);
  return result.success ? result.data : fallback;
};

const element = (tag: string, className: string, children: Node[]): HTMLElement => {
  const el = document.createElement(tag);
  el.className = className;
  el.append(...children);
  return el;
};

export const Page: DomComponent = ({ children }) => element('main', 'k-page', children);
export const Row: DomComponent = ({ children }) => element('div', 'k-row', children);
export const Heading: DomComponent = ({ children }) => element('h1', 'k-heading', children);

const TextProps = z.object({ tone: z.enum(['default', 'muted']).optional() });
export const Text: DomComponent = ({ props, children }) => {
  const { tone } = parsed(TextProps, props, {});
  return element('p', tone === 'muted' ? 'k-text k-muted' : 'k-text', children);
};

const ButtonProps = z.object({ label: z.string().optional() });
export const Button: DomComponent = ({ props, children }) => {
  const { label } = parsed(ButtonProps, props, {});
  const button = element('button', 'k-button', label !== undefined ? [document.createTextNode(label)] : children);
  button.setAttribute('type', 'button');
  return button;
};
