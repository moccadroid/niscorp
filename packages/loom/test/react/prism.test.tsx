// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { OP_KEYS } from '@niscorp/prism';
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

  it('renaming a template field to a name another field has keeps both fields, shows the clash, and renames once it is gone', () => {
    const { lastConfig } = openConfig({ field: { $const: 1 }, field1: { $const: 2 } });
    const second = screen.getByDisplayValue('field1');
    fireEvent.change(second, { target: { value: 'field' } });
    expect(lastConfig()).toEqual({ field: { $const: 1 }, field1: { $const: 2 } });
    expect(second).toHaveProperty('value', 'field');
    expect(screen.getByRole('alert').textContent).toBe('"field" is already a key');
    fireEvent.change(second, { target: { value: 'fiel' } });
    expect(lastConfig()).toEqual({ field: { $const: 1 }, fiel: { $const: 2 } });
    fireEvent.change(second, { target: { value: 'field' } });
    fireEvent.blur(second);
    expect(second).toHaveProperty('value', 'fiel');
  });

  it('a chosen op starts with its required arguments only', () => {
    const chosen = (op: string): unknown => {
      const { lastConfig } = openConfig({ $ref: '$.name' });
      fireEvent.click(chooserOf('$ref'));
      fireEvent.change(screen.getByPlaceholderText('Search ops…'), { target: { value: op } });
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^\\${op}\\b`) }));
      const config = lastConfig();
      cleanup();
      return config;
    };
    expect(chosen('$localeMoney')).toEqual({ $localeMoney: {} });
    expect(chosen('$localeDate')).toEqual({ $localeDate: {} });
    expect(chosen('$round')).toEqual({ $round: {} });
    expect(chosen('$sortBy')).toEqual({ $sortBy: { as: '' } });
  });

  it('an optional argument with a value can be removed', () => {
    const { lastConfig } = openConfig({ $round: { value: 1.5, digits: 2 } });
    const removes = screen.getAllByRole('button', { name: 'Remove' });
    expect(removes).toHaveLength(1);
    fireEvent.click(removes[0]!);
    expect(lastConfig()).toEqual({ $round: { value: 1.5 } });
    expect(screen.queryAllByRole('button', { name: 'Remove' })).toHaveLength(0);
  });

  it('lists every prism op under a category of the chooser', () => {
    openConfig({ $ref: '$.name' });
    fireEvent.click(chooserOf('$ref'));
    const panes = screen.getByPlaceholderText('Search ops…').nextElementSibling;
    if (!(panes instanceof HTMLElement)) throw new Error('no category panes');
    const [categoryPane, opPane] = Array.from(panes.children);
    if (!(categoryPane instanceof HTMLElement) || !(opPane instanceof HTMLElement)) throw new Error('no panes');
    const listed = new Set<string>();
    for (const category of within(categoryPane).getAllByRole('button')) {
      fireEvent.click(category);
      for (const op of within(opPane).queryAllByRole('button')) listed.add(op.textContent ?? '');
    }
    expect(OP_KEYS.filter((op) => !listed.has(op))).toEqual([]);
  });
});
