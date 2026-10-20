import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { z } from 'zod';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

const parsed = <T,>(schema: z.ZodType<T>, props: unknown, fallback: T): T => {
  const result = schema.safeParse(props);
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

const TextProps = z.object({ tone: z.enum(['default', 'muted', 'strong', 'error']).optional().describe('default | muted | strong | error') });
export const Text: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { tone } = parsed(TextProps, props, {});
  return <p className={tone === undefined || tone === 'default' ? 'k-text' : `k-text k-${tone}`}>{children}</p>;
};
Text.meta = { description: 'A paragraph.', propsSchema: TextProps };

const ButtonProps = z.object({
  label: z.string().optional().describe('What the button says; falls back to its children.'),
  tone: z.enum(['primary', 'quiet']).optional().describe('primary | quiet'),
  value: z.unknown().optional().describe('Sent with the click as its payload.'),
});
export const Button: NovaComponent = ({ children, novaRef, novaModel: _model, ...props }) => {
  const dispatch = useNovaDispatch();
  const { label, tone, value } = parsed(ButtonProps, props, {});
  return (
    <button
      type="button"
      className={tone === 'quiet' ? 'k-button k-quiet' : 'k-button'}
      data-ref={novaRef}
      onClick={() => dispatch({ type: 'ui:click', ...(novaRef !== undefined ? { ref: novaRef } : {}), ...(value !== undefined ? { payload: value } : {}) })}
    >
      {label ?? children}
    </button>
  );
};
Button.meta = { description: 'A button; dispatches ui:click with its ref, and its value as the payload.', propsSchema: ButtonProps };

const FrameProps = z.object({}).describe('The whole app: a bar, the answer, the line to ask in.');
export const Frame: NovaComponent = ({ children }) => <div className="k-frame">{children}</div>;
Frame.meta = { description: 'The whole app, top to bottom.', propsSchema: FrameProps };

const BarProps = z.object({}).describe('The strip across the top.');
export const Bar: NovaComponent = ({ children }) => <header className="k-bar">{children}</header>;
Bar.meta = { description: 'The strip across the top.', propsSchema: BarProps };

const MenuProps = z.object({}).describe('A list that opens under the bar: one choice a line.');
export const Menu: NovaComponent = ({ children }) => <nav className="k-menu">{children}</nav>;
Menu.meta = { description: 'A list that opens under the bar.', propsSchema: MenuProps };

const AnswersProps = z.object({}).describe('Where an answer is drawn: its areas arrange themselves by how many are in use.');
export const Answers: NovaComponent = ({ children }) => <main className="k-answers">{children}</main>;
Answers.meta = { description: 'The areas an answer is drawn in.', propsSchema: AnswersProps };

const AreaProps = z.object({ name: z.string().describe('Which area: a, b, c or d.') });
export const Area: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { name } = parsed(AreaProps, props, { name: '' });
  return <section className={`k-area k-area-${name}`}>{children}</section>;
};
Area.meta = { description: 'One area of an answer.', propsSchema: AreaProps };

const CardProps = z.object({ title: z.string().optional().describe('What the card shows, in a few words.') });
export const Card: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { title } = parsed(CardProps, props, {});
  return (
    <article className="k-card">
      {title !== undefined && title !== '' ? <h2 className="k-card-title">{title}</h2> : null}
      {children}
    </article>
  );
};
Card.meta = { description: 'One part of an answer, with its title.', propsSchema: CardProps };

const TableProps = z.object({
  columns: z.array(z.object({ key: z.string(), label: z.string() })).describe('The columns, in order: the row field and its heading.'),
  rows: z.array(z.record(z.string(), z.unknown())).describe('The rows.'),
});
export const Table: NovaComponent = ({ novaRef: _ref, novaModel: _model, ...props }) => {
  const { columns, rows } = parsed(TableProps, props, { columns: [], rows: [] });
  return (
    <div className="k-table-wrap">
      <table className="k-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, at) => (
            <tr key={at}>
              {columns.map((column) => (
                <td key={column.key}>{cell(row[column.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
Table.meta = { description: 'Rows as a table.', propsSchema: TableProps };

const StatProps = z.object({ value: z.unknown().describe('The number.'), label: z.string().optional().describe('What it counts.') });
export const Stat: NovaComponent = ({ novaRef: _ref, novaModel: _model, ...props }) => {
  const { value, label } = parsed(StatProps, props, { value: '' });
  return (
    <div className="k-stat">
      <strong className="k-stat-value">{cell(value)}</strong>
      {label !== undefined ? <span className="k-stat-label">{label}</span> : null}
    </div>
  );
};
Stat.meta = { description: 'One number, and what it counts.', propsSchema: StatProps };

const BarsProps = z.object({ items: z.array(z.object({ label: z.unknown(), value: z.number() })).describe('One bar per item, as long as its value.') });
export const Bars: NovaComponent = ({ novaRef: _ref, novaModel: _model, ...props }) => {
  const { items } = parsed(BarsProps, props, { items: [] });
  const most = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="k-bars">
      {items.map((item, at) => (
        <li key={at} className="k-bars-item">
          <span className="k-bars-label">{cell(item.label)}</span>
          <span className="k-bars-track">
            <span className="k-bars-fill" style={{ width: `${(item.value / most) * 100}%` }} />
          </span>
          <span className="k-bars-value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
};
Bars.meta = { description: 'Values side by side as bars.', propsSchema: BarsProps };

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

const PromptProps = z.object({}).describe('The line to ask in, across the bottom.');
export const Prompt: NovaComponent = ({ children }) => <footer className="k-prompt">{children}</footer>;
Prompt.meta = { description: 'The line to ask in.', propsSchema: PromptProps };

const FieldProps = z.object({ label: z.string().describe('What the field is for.') });
export const Field: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { label } = parsed(FieldProps, props, { label: '' });
  return (
    <label className="k-field">
      <span className="k-field-label">{label}</span>
      {children}
    </label>
  );
};
Field.meta = { description: 'A labelled field of a form.', propsSchema: FieldProps };
