// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { DatabaseSchema, Query } from '@niscorp/vex';
import { LoomEditor } from '../../src/react/index.js';
import { vex, type VexRunResult } from '../../src/plugins/vex/react/index.js';

afterEach(cleanup);

const column = (name: string, normalizedType: 'string' | 'number') => ({ name, type: normalizedType, normalizedType, nullable: false, primaryKey: false });
const db: DatabaseSchema = {
  entities: [{ name: 'orders', table: 'orders', fields: [column('id', 'string'), column('total', 'number')], relations: [], indexes: [] }],
};

const openQuery = (query: Record<string, unknown>, run: (query: Query) => Promise<VexRunResult> = async () => ({ rows: [] })) => {
  const onChange = vi.fn();
  render(<LoomEditor plugins={[vex({ run, db })]} artifact={{ type: 'vex', documents: { query } }} onChange={onChange} />);
  const lastQuery = (): Record<string, unknown> => {
    const documents: unknown = onChange.mock.lastCall?.[0];
    const value = typeof documents === 'object' && documents !== null ? Reflect.get(documents, 'query') : undefined;
    return typeof value === 'object' && value !== null ? { ...value } : {};
  };
  return { lastQuery };
};

const aliases = (): HTMLInputElement[] => screen.getAllByPlaceholderText('alias').filter((el) => el instanceof HTMLInputElement);

const recordRows = (): HTMLElement => {
  const root = aliases()[0]?.parentElement?.parentElement?.parentElement;
  if (root === null || root === undefined) throw new Error('no record rows');
  return root;
};

describe('the vex aggregate and compute widgets', () => {
  it('show one row per alias, and write a picked operand back', () => {
    const { lastQuery } = openQuery({ from: ['orders'], aggregate: { orders: { count: '*' } } });
    expect(aliases().map((input) => input.value)).toEqual(['orders']);
    fireEvent.change(within(recordRows()).getByRole('combobox'), { target: { value: 'sum' } });
    expect(lastQuery()['aggregate']).toEqual({ orders: { sum: '' } });
    fireEvent.change(within(recordRows()).getByPlaceholderText('entity.field'), { target: { value: 'orders.total' } });
    expect(lastQuery()['aggregate']).toEqual({ orders: { sum: 'orders.total' } });
  });

  it('renaming an alias to one another row has keeps both rows, shows the clash, and renames once it is gone', () => {
    const { lastQuery } = openQuery({ from: ['orders'], aggregate: { field: { count: '*' }, field1: { sum: 'orders.total' } } });
    const second = aliases()[1];
    if (second === undefined) throw new Error('no second alias');
    fireEvent.change(second, { target: { value: 'field' } });
    expect(lastQuery()['aggregate']).toEqual({ field: { count: '*' }, field1: { sum: 'orders.total' } });
    expect(second.value).toBe('field');
    expect(screen.getByRole('alert').textContent).toBe('"field" is already a key');
    fireEvent.change(second, { target: { value: 'fiel' } });
    expect(lastQuery()['aggregate']).toEqual({ field: { count: '*' }, fiel: { sum: 'orders.total' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('adding a row after a delete does not overwrite a row that is left', () => {
    const { lastQuery } = openQuery({ from: ['orders'], aggregate: { field_1: { count: '*' }, field_2: { sum: 'orders.total' } } });
    const removeFirst = within(recordRows()).getAllByRole('button', { name: '✕' })[0];
    if (removeFirst === undefined) throw new Error('no remove button');
    fireEvent.click(removeFirst);
    fireEvent.click(within(recordRows()).getByRole('button', { name: 'Add' }));
    const aggregate = lastQuery()['aggregate'];
    expect(aggregate).toMatchObject({ field_2: { sum: 'orders.total' } });
    expect(Object.keys(typeof aggregate === 'object' && aggregate !== null ? aggregate : {})).toHaveLength(2);
  });

  it('a compute operand can be typed as a decimal', () => {
    const { lastQuery } = openQuery({ from: ['orders'], compute: { net: { multiply: ['', ''] } } });
    const first = screen.getAllByPlaceholderText('field or value')[0];
    if (!(first instanceof HTMLInputElement)) throw new Error('no operand');
    fireEvent.change(first, { target: { value: '1.' } });
    expect(first.value).toBe('1.');
    fireEvent.change(first, { target: { value: '1.5' } });
    expect(first.value).toBe('1.5');
    expect(lastQuery()['compute']).toEqual({ net: { multiply: [1.5, ''] } });
  });
});

describe('the vex preview', () => {
  it('runs the query and shows its rows and warnings', async () => {
    const run = vi.fn(async (_query: Query): Promise<VexRunResult> => ({ rows: [{ id: 'o1', total: null }], warnings: ['capped at 100 rows'] }));
    openQuery({ from: ['orders'], fields: ['orders.id', 'orders.total'] }, run);
    expect(await screen.findByText('o1')).toBeDefined();
    expect(screen.getByText('∅')).toBeDefined();
    expect(screen.getByText('capped at 100 rows')).toBeDefined();
    expect(run).toHaveBeenLastCalledWith({ from: ['orders'], fields: ['orders.id', 'orders.total'] });
  });

  it('shows the errors a run answers, and a run that throws', async () => {
    openQuery({ from: ['orders'], fields: ['orders.id'] }, async () => ({ rows: [], errors: ['no such column'] }));
    expect(await screen.findByText('no such column')).toBeDefined();
    cleanup();
    openQuery({ from: ['orders'], fields: ['orders.id'] }, async () => Promise.reject(new Error('database is down')));
    expect(await screen.findByText('database is down')).toBeDefined();
  });
});
