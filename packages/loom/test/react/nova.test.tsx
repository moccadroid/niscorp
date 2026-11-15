// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { LoomEditor } from '../../src/react/index.js';
import { nova } from '../../src/plugins/nova/react/index.js';

afterEach(cleanup);

const Card: NovaComponent<{ title?: string }> = ({ title, children }) => (
  <section aria-label={title}>{children}</section>
);
const Line: NovaComponent<{ text?: string }> = ({ text }) => <p>{`line: ${text ?? ''}`}</p>;

const plugin = nova({
  manifest: [
    { name: 'Card', props: z.object({ title: z.string() }), container: true, render: Card },
    { name: 'Line', props: z.object({ text: z.string() }), render: Line },
  ],
});

describe('the nova plugin', () => {
  it('previews the layout with its data, and follows an edit to the data', () => {
    const onChange = vi.fn();
    render(
      <LoomEditor
        plugins={[plugin]}
        artifact={{
          type: 'nova',
          documents: { layout: { component: 'Card', props: { title: 'Guest' }, children: [{ component: 'Line', props: { text: '$.who' } }] }, data: { who: 'Ada' } },
        }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('region', { name: 'Guest' })).toBeDefined();
    expect(screen.getByText('line: Ada')).toBeDefined();

    fireEvent.change(screen.getByDisplayValue('Ada'), { target: { value: 'Grace' } });
    expect(screen.getByText('line: Grace')).toBeDefined();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ data: { who: 'Grace' } }));
  });

  it('edits the layout through a form built from the manifest', () => {
    const onChange = vi.fn();
    render(<LoomEditor plugins={[plugin]} artifact={{ type: 'nova', documents: { layout: { component: 'Line', props: { text: 'hello' } }, data: {} } }} onChange={onChange} />);
    expect(screen.getByText('line: hello')).toBeDefined();
    fireEvent.change(screen.getByDisplayValue('hello'), { target: { value: 'goodbye' } });
    expect(screen.getByText('line: goodbye')).toBeDefined();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ layout: { component: 'Line', props: { text: 'goodbye' } } }));
  });
});
