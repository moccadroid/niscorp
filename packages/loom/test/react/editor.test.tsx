// @vitest-environment jsdom
import { StrictMode, type FC } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { z, type ZodType } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { LoomEditor } from '../../src/react/index.js';
import { Roles } from '../../src/index.js';

afterEach(cleanup);

// Render the kit as a single-schema form through the editor (one document,
// `value`), with the surface the kit tests use: schema / onChange / options.value
// / components. The editor is the only form surface, so this stands in for it.
const LoomForm: FC<{
  schema: ZodType;
  onChange?: (document: Record<string, unknown>) => void;
  options?: { value?: unknown };
  components?: Record<string, NovaComponent>;
}> = ({ schema, onChange, options, components }) => (
  <LoomEditor
    plugins={[{ name: 'test', documents: { value: schema }, ...(components ? { components } : {}) }]}
    artifact={{ type: 'test', ...(options?.value !== undefined ? { documents: { value: options.value } } : {}) }}
    onChange={(docs) => onChange?.(docs['value'] as Record<string, unknown>)}
  />
);

const personSchema = z.object({
  name: z.string(),
  age: z.int(),
  active: z.boolean(),
});

describe('LoomForm — pixels and round-trip', () => {
  it('renders a control per field, with defaults from the schema', () => {
    render(<LoomForm schema={personSchema} />);
    expect(screen.getByRole('textbox')).toHaveProperty('value', '');
    expect(screen.getByRole('spinbutton')).toHaveProperty('value', '0');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('writes edits back into the document', () => {
    const onChange = vi.fn();
    render(<LoomForm schema={personSchema} onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ada' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Ada' }));

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '42' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ age: 42 }));

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ active: true }));
  });

  it('reflects the new value in the control after an edit', () => {
    render(<LoomForm schema={personSchema} />);
    const name = screen.getByRole('textbox');
    fireEvent.change(name, { target: { value: 'Grace' } });
    expect(name).toHaveProperty('value', 'Grace');
  });

  it('renders and round-trips under StrictMode (shell is not left disposed)', () => {
    // StrictMode mounts, unmounts, then remounts. A shell created in render
    // would be disposed by the first cleanup and never recreated, leaving a
    // blank form. Creating it in the effect keeps the live shell paired.
    const onChange = vi.fn();
    render(
      <StrictMode>
        <LoomForm schema={personSchema} onChange={onChange} />
      </StrictMode>,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ada' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Ada' }));
  });

  it('keeps the document across parent re-renders with new inline props', () => {
    // The shell owns the document; re-rendering with fresh inline `options`
    // and `onChange` identities must not recreate it and wipe the edit.
    const { rerender } = render(<LoomForm schema={personSchema} onChange={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ada' } });
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Ada');

    rerender(<LoomForm schema={personSchema} options={{}} onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Ada');
  });

  it('surfaces a Zod validation error on the field and clears it when valid', () => {
    const schema = z.object({ email: z.email({ message: 'Bad email' }) });
    render(<LoomForm schema={schema} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'nope' } });
    expect(screen.getByText('Bad email')).toBeDefined();

    fireEvent.change(input, { target: { value: 'a@b.com' } });
    expect(screen.queryByText('Bad email')).toBeNull();
  });

  it('reports the document without the error channel', () => {
    const onChange = vi.fn();
    render(<LoomForm schema={z.object({ name: z.string() })} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ada' } });
    expect(onChange).toHaveBeenLastCalledWith({ name: 'Ada' });
  });

  it('adds, edits, reorders, and removes array items', () => {
    const onChange = vi.fn();
    render(<LoomForm schema={z.object({ tags: z.array(z.string()) })} onChange={onChange} />);

    // Empty to start: no item inputs, just the add button.
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0]!, { target: { value: 'a' } });
    fireEvent.change(inputs[1]!, { target: { value: 'b' } });
    expect(onChange).toHaveBeenLastCalledWith({ tags: ['a', 'b'] });

    // Reorder: open the first row's menu, Move down (0 → 1).
    fireEvent.click(screen.getAllByRole('button', { name: 'Actions' })[0]!);
    fireEvent.click(screen.getByText(/Move down/));
    expect(onChange).toHaveBeenLastCalledWith({ tags: ['b', 'a'] });

    // Remove: open the first row's menu, Remove.
    fireEvent.click(screen.getAllByRole('button', { name: 'Actions' })[0]!);
    fireEvent.click(screen.getByText(/Remove/));
    expect(onChange).toHaveBeenLastCalledWith({ tags: ['a'] });
  });

  it('edits a discriminated union — switching variant reshapes the document', () => {
    const onChange = vi.fn();
    const schema = z.object({
      shape: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('circle'), radius: z.number() }),
        z.object({ kind: z.literal('rect'), w: z.number(), h: z.number() }),
      ]),
    });
    render(<LoomForm schema={schema} onChange={onChange} />);

    // Starts as circle: one number field (radius).
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith({ shape: { kind: 'circle', radius: 5 } });

    // Switch to rect: the document is reshaped and two fields (w, h) appear.
    // Options are addressed by their id (the chooser tracks the active branch by
    // its match, not by a label), so pick the rect option by its value.
    const rect = screen.getByRole('option', { name: 'rect' }) as HTMLOptionElement;
    fireEvent.change(screen.getByRole('combobox'), { target: { value: rect.value } });
    expect(onChange).toHaveBeenLastCalledWith({ shape: { kind: 'rect', w: 0, h: 0 } });
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
  });

  it('edits a mixed union — a string branch shows a text input, an object branch a group', () => {
    const onChange = vi.fn();
    const schema = z.object({
      node: z.union([z.string(), z.object({ component: z.string(), title: z.string() })]),
    });
    // Loaded as the string branch: the widget matches the value's type and shows a text input.
    render(<LoomForm schema={schema} options={{ value: { node: 'hello' } }} onChange={onChange} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('hello');

    // Switch to the object branch: reshaped to its defaults, two fields appear.
    const obj = screen.getByRole('option', { name: 'component' }) as HTMLOptionElement;
    fireEvent.change(screen.getByRole('combobox'), { target: { value: obj.value } });
    expect(onChange).toHaveBeenLastCalledWith({ node: { component: '', title: '' } });
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  it('reorders a container’s children at the root, past a nested container', () => {
    const onChange = vi.fn();
    const node: z.ZodType = z.discriminatedUnion('component', [
      z.object({ component: z.literal('Box'), children: z.array(z.lazy(() => node)) }),
      z.object({ component: z.literal('Stack'), children: z.array(z.lazy(() => node)) }),
      z.object({ component: z.literal('Text'), text: z.string() }),
    ]);
    const schema = z.object({ layout: node });
    const seed = {
      layout: {
        component: 'Box',
        children: [
          { component: 'Text', text: 'a' },
          { component: 'Stack', children: [{ component: 'Text', text: 'inner' }] },
        ],
      },
    };
    render(<LoomForm schema={schema} options={{ value: seed }} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Actions' })[0]!);
    fireEvent.click(screen.getByText(/Move down/));
    expect((onChange.mock.lastCall?.[0] as { layout: { children: { component: string }[] } }).layout.children.map((c) => c.component)).toEqual(['Stack', 'Text']);
  });

  // A recursive layout union with two container variants (Box, Stack) and a leaf
  // (Text) — exercises wrap / unwrap / children-preserving switch.
  const layoutUnion: z.ZodType = z.discriminatedUnion('component', [
    z.object({ component: z.literal('Box'), children: z.array(z.lazy(() => layoutUnion)) }),
    z.object({ component: z.literal('Stack'), children: z.array(z.lazy(() => layoutUnion)) }),
    z.object({ component: z.literal('Text'), text: z.string() }),
  ]);
  const layoutSchema = z.object({ layout: layoutUnion });
  type Layout = { layout: { component: string; children?: { component: string; text?: string }[]; text?: string } };

  it('wraps a node in a container via the row menu', () => {
    const onChange = vi.fn();
    const seed = { layout: { component: 'Box', children: [{ component: 'Text', text: 'a' }] } };
    render(<LoomForm schema={layoutSchema} options={{ value: seed }} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Actions' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: /Wrap in/ })); // open the submenu
    fireEvent.click(screen.getByRole('button', { name: 'Stack' })); // pick the variant

    const children = (onChange.mock.lastCall?.[0] as Layout).layout.children!;
    expect(children).toHaveLength(1);
    expect(children[0]).toEqual({ component: 'Stack', children: [{ component: 'Text', text: 'a' }] });
  });

  it('unwraps a container, lifting its children into the parent list', () => {
    const onChange = vi.fn();
    const seed = {
      layout: {
        component: 'Box',
        children: [
          { component: 'Stack', children: [{ component: 'Text', text: 'a' }, { component: 'Text', text: 'b' }] },
          { component: 'Text', text: 'c' },
        ],
      },
    };
    render(<LoomForm schema={layoutSchema} options={{ value: seed }} onChange={onChange} />);

    // Only the Stack's menu offers Unwrap (Text rows can't). Open menus until it
    // appears, then unwrap — lifting its two children before 'c'.
    for (const kebab of screen.getAllByRole('button', { name: 'Actions' })) {
      fireEvent.click(kebab);
      if (screen.queryByText(/Unwrap/)) break;
      fireEvent.click(kebab); // close and try the next
    }
    fireEvent.click(screen.getByText(/Unwrap/));

    const kids = (onChange.mock.lastCall?.[0] as Layout).layout.children!;
    expect(kids.map((k) => k.text)).toEqual(['a', 'b', 'c']);
  });

  it('switching between container types preserves children', () => {
    const onChange = vi.fn();
    const seed = { layout: { component: 'Box', children: [{ component: 'Text', text: 'a' }, { component: 'Text', text: 'b' }] } };
    render(<LoomForm schema={layoutSchema} options={{ value: seed }} onChange={onChange} />);

    // Root chooser is the first combobox; Stack is option index 1.
    fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: '1' } });

    const layout = (onChange.mock.lastCall?.[0] as Layout).layout;
    expect(layout.component).toBe('Stack');
    expect(layout.children?.map((c) => c.text)).toEqual(['a', 'b']);
  });

  it('switching a container to a leaf confirms before dropping children', () => {
    const onChange = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const seed = { layout: { component: 'Box', children: [{ component: 'Text', text: 'a' }] } };
    render(<LoomForm schema={layoutSchema} options={{ value: seed }} onChange={onChange} />);

    // Switch root Box → Text (option index 2): no child-list, so confirm first.
    fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: '2' } });

    expect(confirm).toHaveBeenCalled();
    const layout = (onChange.mock.lastCall?.[0] as Layout).layout;
    expect(layout.component).toBe('Text');
    expect(layout.children).toBeUndefined();
    confirm.mockRestore();
  });

  it('edits a recursive union (a component tree) — nested nodes render at depth', () => {
    // A node is a Box (with children) or a Text (leaf) — a Nova-layout shape.
    const node: z.ZodType = z.discriminatedUnion('component', [
      z.object({ component: z.literal('Box'), label: z.string(), children: z.array(z.lazy(() => node)) }),
      z.object({ component: z.literal('Text'), text: z.string() }),
    ]);
    const schema = z.object({ root: node });
    const seed = {
      root: { component: 'Box', label: 'outer', children: [{ component: 'Text', text: 'hi' }] },
    };
    render(<LoomForm schema={schema} options={{ value: seed }} />);

    // The root Box's own field, and the nested Text child's field, both render —
    // recursion resolves the template against the live data, at depth.
    expect(screen.getByDisplayValue('outer')).toBeTruthy();
    expect(screen.getByDisplayValue('hi')).toBeTruthy();
  });

  it('renders the same definition through a swapped kit', () => {
    // Same compiled definition, a different component under the text role —
    // the resolver seam. Identical schema, different pixels.
    const AltText: NovaComponent<{ value?: unknown }> = ({ value }) => (
      <input data-testid="alt-text" value={String(value ?? '')} readOnly />
    );

    render(<LoomForm schema={personSchema} components={{ [Roles.text]: AltText }} />);
    expect(screen.getByTestId('alt-text')).toBeDefined();
  });
});
