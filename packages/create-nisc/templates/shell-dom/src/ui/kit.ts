import { z } from 'zod';
import type { DomComponent } from '@niscorp/nova/adapters/dom';

// ═══════════════════════════════════════════════════════════
// The kit: domain-blind primitives, as plain DOM — no framework in the page.
// Props in, an element out; nova's DOM adapter wires a `ref`'d element's clicks
// by convention, so a button is just a button. Each one is CONFIGURED, never
// styled: it reads what a thing is (a tone) from a closed set of names, and
// anything it does not know falls back to the default. The look lives in
// kit.css alone.
// ═══════════════════════════════════════════════════════════

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
