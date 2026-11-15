// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LoomEditor } from '../../src/react/index.js';
import { prism } from '../../src/plugins/prism/react/index.js';

afterEach(cleanup);

const openConfig = (config: unknown) => {
  const onChange = vi.fn();
  render(<LoomEditor plugins={[prism({ input: { name: 'Ada' } })]} artifact={{ type: 'prism', documents: { config } }} onChange={onChange} />);
  const lastConfig = (): unknown => {
    const documents: unknown = onChange.mock.lastCall?.[0];
    return typeof documents === 'object' && documents !== null ? Reflect.get(documents, 'config') : undefined;
  };
  return { lastConfig };
};

const chooserOf = (label: string): HTMLElement => {
  const button = screen.getAllByRole('button').find((el) => el.textContent?.startsWith(label) === true && el.textContent.includes('▾'));
  if (button === undefined) throw new Error(`no chooser showing ${label}`);
  return button;
};

describe('the prism node editor', () => {
  it('edits a template field and shows the output', () => {
    const { lastConfig } = openConfig({ greeting: { $ref: '$.name' } });
    expect(screen.getByText(/"greeting": "Ada"/)).toBeDefined();
    fireEvent.change(screen.getByDisplayValue('$.name'), { target: { value: '$.missing' } });
    expect(lastConfig()).toEqual({ greeting: { $ref: '$.missing' } });
  });

  it('changes a node to another op from the chooser', () => {
    const { lastConfig } = openConfig({ $ref: '$.name' });
    fireEvent.click(chooserOf('$ref'));
    fireEvent.change(screen.getByPlaceholderText('Search ops…'), { target: { value: '$upper' } });
    fireEvent.click(screen.getByRole('button', { name: /^\$upper\b/ }));
    expect(Object.keys(Object(lastConfig()))).toEqual(['$upper']);
  });

  it('wraps a node in an op from the restructure menu', () => {
    const { lastConfig } = openConfig({ $ref: '$.name' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Restructure' })[0]!);
    fireEvent.mouseEnter(screen.getByText('⧉ Wrap in'));
    fireEvent.click(screen.getByText('$upper'));
    expect(lastConfig()).toEqual({ $upper: { $ref: '$.name' } });
  });

  it('renaming a template field to a name another field has keeps both fields', () => {
    const { lastConfig } = openConfig({ a: { $const: 1 }, b: { $const: 2 } });
    fireEvent.change(screen.getByDisplayValue('b'), { target: { value: 'a' } });
    expect(lastConfig()).toEqual({ a: { $const: 1 }, b: { $const: 2 } });
    fireEvent.change(screen.getByDisplayValue('b'), { target: { value: 'c' } });
    expect(lastConfig()).toEqual({ a: { $const: 1 }, c: { $const: 2 } });
  });
});
