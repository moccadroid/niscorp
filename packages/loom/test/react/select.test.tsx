// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { z, type ZodType } from 'zod';
import { LoomEditor } from '../../src/react/index.js';

afterEach(cleanup);

// What the README says of an enum in the built-in kit. An enum has no empty
// value, so a new document leaves its key out; the select has no row for "none"
// and displays its first option. `.default()` is what starts the two agreeing.
// A change to the select changes that README passage with it.

const formOf = (schema: ZodType) => {
  const onChange = vi.fn();
  render(<LoomEditor plugins={[{ name: 'test', documents: { value: schema } }]} artifact={{ type: 'test' }} onChange={onChange} />);
  const select = screen.getByRole('combobox');
  const shown = select instanceof HTMLSelectElement ? select.value : undefined;
  const lastCall: unknown[] = onChange.mock.calls.at(-1) ?? [];
  return { shown, documents: lastCall[0] };
};

describe('the built-in select and a document with no value for it', () => {
  it('a new required enum is left out of the document while the select displays its first option', () => {
    const { shown, documents } = formOf(z.object({ house: z.enum(['main', 'studio']) }));
    expect(documents).toEqual({ value: {} });
    expect(shown).toBe('main');
  });

  it('an optional enum starts the same way', () => {
    const { shown, documents } = formOf(z.object({ house: z.enum(['main', 'studio']).optional() }));
    expect(documents).toEqual({ value: {} });
    expect(shown).toBe('main');
  });

  it('a default puts the value in the document, and the select displays it', () => {
    const { shown, documents } = formOf(z.object({ house: z.enum(['main', 'studio']).default('studio') }));
    expect(documents).toEqual({ value: { house: 'studio' } });
    expect(shown).toBe('studio');
  });
});
