// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { z, type ZodType } from 'zod';
import { LoomEditor } from '../../src/react/index.js';

afterEach(cleanup);

const formOf = (schema: ZodType) => {
  const onChange = vi.fn();
  render(<LoomEditor plugins={[{ name: 'test', documents: { value: schema } }]} artifact={{ type: 'test' }} onChange={onChange} />);
  const select = screen.getByRole('combobox');
  const shown = select instanceof HTMLSelectElement ? select.value : undefined;
  const lastCall: unknown[] = onChange.mock.calls.at(-1) ?? [];
  return { shown, documents: lastCall[0] };
};

describe('the built-in select and a document with no value for it', () => {
  it('a new required enum is left out of the document, and the select shows that it has no value', () => {
    const { shown, documents } = formOf(z.object({ house: z.enum(['main', 'studio']) }));
    expect(documents).toEqual({ value: {} });
    expect(shown).toBe('');
    expect(screen.getByRole('option', { name: '—' })).toHaveProperty('disabled', true);
  });

  it('an optional enum starts the same way', () => {
    const { shown, documents } = formOf(z.object({ house: z.enum(['main', 'studio']).optional() }));
    expect(documents).toEqual({ value: {} });
    expect(shown).toBe('');
  });

  it('choosing the first option writes it', () => {
    const onChange = vi.fn();
    render(<LoomEditor plugins={[{ name: 'test', documents: { value: z.object({ size: z.enum(['s', 'm', 'l']) }) } }]} artifact={{ type: 'test' }} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 's' } });
    expect(onChange).toHaveBeenLastCalledWith({ value: { size: 's' } });
    expect(screen.queryAllByRole('option', { name: '—' })).toHaveLength(0);
  });

  it('a default puts the value in the document, and the select displays it', () => {
    const { shown, documents } = formOf(z.object({ house: z.enum(['main', 'studio']).default('studio') }));
    expect(documents).toEqual({ value: { house: 'studio' } });
    expect(shown).toBe('studio');
    expect(screen.queryAllByRole('option', { name: '—' })).toHaveLength(0);
  });
});
