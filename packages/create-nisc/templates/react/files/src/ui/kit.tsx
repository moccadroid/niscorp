import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { z } from 'zod';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

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

const PageProps = z.object({}).describe('The page: a centred column with the app’s background.');
export const Page: NovaComponent = ({ children }) => <main className="k-page">{children}</main>;
Page.meta = { description: 'The page: a centred column.', propsSchema: PageProps };

const RowProps = z.object({}).describe('Children side by side, centred.');
export const Row: NovaComponent = ({ children }) => <div className="k-row">{children}</div>;
Row.meta = { description: 'Children side by side.', propsSchema: RowProps };

const HeadingProps = z.object({}).describe('The page’s title.');
export const Heading: NovaComponent = ({ children }) => <h1 className="k-heading">{children}</h1>;
Heading.meta = { description: 'The page’s title.', propsSchema: HeadingProps };

const TextProps = z.object({
  tone: z
    .enum(['default', 'lead', 'muted', 'strong', 'display', 'right', 'wrong', 'error'])
    .optional()
    .describe('default | lead: the sentence a card opens with | muted | strong | display: one big figure | right: a right answer, said | wrong: a wrong answer, said | error'),
});
export const Text: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { tone } = parsed(TextProps, props, {});
  return <p className={tone === undefined || tone === 'default' ? 'k-text' : `k-text k-${tone}`}>{children}</p>;
};
Text.meta = { description: 'A paragraph.', propsSchema: TextProps };

const ButtonProps = z.object({
  label: z.string().optional().describe('What the button says; falls back to its children.'),
  tone: z
    .enum(['primary', 'suggestion', 'link', 'choice', 'chosen', 'right', 'wrong', 'summary', 'step'])
    .optional()
    .describe(
      'primary: what the action does | suggestion: a thing to ask | link: opens another screen | choice: one of a set to choose from | chosen: the one of the set that is chosen | right: the right one of a set, once picked | wrong: a wrong one, picked | summary: names what is shown, and opens to more | step: back, forward, or start over',
    ),
  value: z.unknown().optional().describe('Sent with the click as its payload.'),
});
export const Button: NovaComponent = ({ children, novaRef, novaModel: _model, ...props }) => {
  const dispatch = useNovaDispatch();
  const { label, tone, value } = parsed(ButtonProps, props, {});
  return (
    <button
      type="button"
      className={tone === undefined || tone === 'primary' ? 'k-button' : `k-button k-${tone}`}
      onClick={() => dispatch({ type: 'ui:click', ...(novaRef !== undefined ? { ref: novaRef } : {}), ...(value !== undefined ? { payload: value } : {}) })}
    >
      {label ?? children}
    </button>
  );
};
Button.meta = { description: 'A button; dispatches ui:click with its ref, and its value as the payload.', propsSchema: ButtonProps };

const FrameProps = z.object({}).describe('The whole app: the answer, and the dock under it.');
export const Frame: NovaComponent = ({ children }) => <div className="k-frame">{children}</div>;
Frame.meta = { description: 'The whole app, top to bottom.', propsSchema: FrameProps };

const DockProps = z.object({}).describe('What stays at the bottom while the answer scrolls above it.');
export const Dock: NovaComponent = ({ children }) => <footer className="k-dock">{children}</footer>;
Dock.meta = { description: 'What stays at the bottom while the answer scrolls above it.', propsSchema: DockProps };

const MenuProps = z.object({}).describe('A list that opens above the dock: one choice a line.');
export const Menu: NovaComponent = ({ children }) => <nav className="k-menu">{children}</nav>;
Menu.meta = { description: 'A list that opens above the dock.', propsSchema: MenuProps };

const GridProps = z.object({ columns: z.number().int().min(1).max(3).optional().describe('How many columns its areas are laid out in: 1 to 3.') });
export const Grid: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { columns } = parsed(GridProps, props, {});
  return (
    <main className={`k-grid k-columns-${columns ?? 2}`}>
      {children}
    </main>
  );
};
Grid.meta = { description: 'Areas in columns, row by row.', propsSchema: GridProps };

const AreaProps = z.object({
  name: z.string().describe('Which canvas it holds.'),
  span: z.number().int().min(1).max(3).optional().describe('How many columns it takes.'),
  changed: z.boolean().optional().describe('Whether the last answer changed what it holds.'),
});
export const Area: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { span, changed } = parsed(AreaProps, props, { name: '' });
  return (
    <section className={`k-area k-span-${span ?? 1}${changed === true ? ' k-area-changed' : ''}`}>
      {children}
    </section>
  );
};
Area.meta = { description: 'One area of an answer.', propsSchema: AreaProps };

const CardProps = z.object({
  title: z.string().optional().describe('What the card shows, in a few words.'),
  tone: z.enum(['default', 'hero']).optional().describe('default | hero: the card a screen opens with'),
});
export const Card: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { title, tone } = parsed(CardProps, props, {});
  return (
    <article className={tone === 'hero' ? 'k-card k-hero' : 'k-card'}>
      {title !== undefined && title !== '' ? <h2 className="k-card-title">{title}</h2> : null}
      {children}
    </article>
  );
};
Card.meta = { description: 'One part of an answer, with its title.', propsSchema: CardProps };

const CodeProps = z.object({ text: z.string().describe('The code, as it is to be read.') });
export const Code: NovaComponent = ({ novaRef: _ref, novaModel: _model, ...props }) => {
  const { text } = parsed(CodeProps, props, { text: '' });
  return (
    <pre className="k-code">
      <code>{text}</code>
    </pre>
  );
};
Code.meta = { description: 'A block of code, kept as written.', propsSchema: CodeProps };

const PointsProps = z.object({ items: z.array(z.object({ title: z.string(), text: z.string() })).describe('Each point: a few words, and a sentence.') });
export const Points: NovaComponent = ({ novaRef: _ref, novaModel: _model, ...props }) => {
  const { items } = parsed(PointsProps, props, { items: [] });
  return (
    <dl className="k-points">
      {items.map((item) => (
        <div key={item.title} className="k-point">
          <dt>{item.title}</dt>
          <dd>{item.text}</dd>
        </div>
      ))}
    </dl>
  );
};
Points.meta = { description: 'A few points, each a few words and a sentence.', propsSchema: PointsProps };

const StepsProps = z.object({ items: z.array(z.string()).describe('The steps, in order.') });
export const Steps: NovaComponent = ({ novaRef: _ref, novaModel: _model, ...props }) => {
  const { items } = parsed(StepsProps, props, { items: [] });
  return (
    <ol className="k-steps">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
};
Steps.meta = { description: 'Steps in order, numbered.', propsSchema: StepsProps };

const CheckProps = z.object({
  label: z.string().describe('What is ticked off.'),
  checked: z.boolean().optional().describe('Whether it is ticked.'),
  value: z.unknown().optional().describe('Sent with the click as its payload.'),
});
export const Check: NovaComponent = ({ novaRef, novaModel: _model, ...props }) => {
  const dispatch = useNovaDispatch();
  const { label, checked, value } = parsed(CheckProps, props, { label: '' });
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked === true}
      className={checked === true ? 'k-check k-checked' : 'k-check'}
      onClick={() => dispatch({ type: 'ui:click', ...(novaRef !== undefined ? { ref: novaRef } : {}), ...(value !== undefined ? { payload: value } : {}) })}
    >
      <span className="k-box" aria-hidden="true" />
      <span className="k-check-label">{label}</span>
    </button>
  );
};
Check.meta = { description: 'A line to tick off; dispatches ui:click with its ref, and its value as the payload.', propsSchema: CheckProps };

const InputProps = z.object({
  placeholder: z.string().optional(),
  value: z.unknown().optional(),
  clearOnEnter: z.boolean().optional().describe('Empties itself on Enter: a line something is sent from.'),
});
// While it has focus, what is typed wins over what the shell echoes back, so a
// round trip to the server never takes a keystroke away.
export const Input: NovaComponent = ({ novaRef, novaModel, ...props }) => {
  const dispatch = useNovaDispatch();
  const { placeholder, value, clearOnEnter } = parsed(InputProps, props, {});
  const [draft, setDraft] = useState<string | null>(null);
  const ref = novaModel?.ref ?? novaRef;
  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setDraft(event.target.value);
    if (novaModel !== undefined) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: event.target.value });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (ref !== undefined) dispatch({ type: 'ui:key', ref, key: event.key });
    if (event.key === 'Enter' && clearOnEnter === true) setDraft('');
  };
  return (
    <input
      className="k-input"
      placeholder={placeholder}
      value={draft ?? cell(value)}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onFocus={() => setDraft(cell(value))}
      onBlur={() => setDraft(null)}
    />
  );
};
Input.meta = { description: 'A line of text, bound to data with the node’s `model`; Enter is a ui:key.', propsSchema: InputProps };

const PromptProps = z.object({}).describe('The line to ask in, and the button that sends it.');
export const Prompt: NovaComponent = ({ children }) => <div className="k-prompt">{children}</div>;
Prompt.meta = { description: 'The line to ask in.', propsSchema: PromptProps };
