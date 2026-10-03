import { z } from 'zod';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// ═══════════════════════════════════════════════════════════
// The kit: domain-blind primitives. Props in, events out. Each one is
// CONFIGURED, never styled — it reads what a thing is (a tone, a level) from a
// closed set of names, and anything it does not know falls back to the default.
// The look lives in kit.css alone.
//
// Every prop a layout passes is parsed here, at the boundary (rule 13); a
// layout that names an unknown value gets the default, never a crash.
// ═══════════════════════════════════════════════════════════

const parsed = <T,>(schema: z.ZodType<T>, props: unknown, fallback: T): T => {
  const result = schema.safeParse(props);
  return result.success ? result.data : fallback;
};

const PageProps = z.object({}).describe('The page: a centred column with the app’s background.');
export const Page: NovaComponent = ({ children }) => <main className="k-page">{children}</main>;
Page.meta = { description: 'The page: a centred column.', propsSchema: PageProps };

const RowProps = z.object({}).describe('Children side by side, centred.');
export const Row: NovaComponent = ({ children }) => <div className="k-row">{children}</div>;
Row.meta = { description: 'Children side by side.', propsSchema: RowProps };

const HeadingProps = z.object({}).describe('The page’s title.');
export const Heading: NovaComponent = ({ children }) => <h1 className="k-heading">{children}</h1>;
Heading.meta = { description: 'The page’s title.', propsSchema: HeadingProps };

const TextProps = z.object({ tone: z.enum(['default', 'muted']).optional().describe('default | muted') });
export const Text: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { tone } = parsed(TextProps, props, {});
  return <p className={tone === 'muted' ? 'k-text k-muted' : 'k-text'}>{children}</p>;
};
Text.meta = { description: 'A paragraph.', propsSchema: TextProps };

const ButtonProps = z.object({ label: z.string().optional().describe('What the button says; falls back to its children.') });
export const Button: NovaComponent = ({ children, novaRef, novaModel: _model, ...props }) => {
  const dispatch = useNovaDispatch();
  const { label } = parsed(ButtonProps, props, {});
  return (
    <button type="button" className="k-button" data-ref={novaRef} onClick={() => dispatch({ type: 'ui:click', ...(novaRef !== undefined ? { ref: novaRef } : {}) })}>
      {label ?? children}
    </button>
  );
};
Button.meta = { description: 'A button; dispatches ui:click with its ref.', propsSchema: ButtonProps };
