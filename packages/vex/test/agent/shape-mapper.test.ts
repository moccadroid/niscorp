import { describe, it, expect } from 'vitest';
import type { SignalClient } from '@niscorp/cortex';
import { createShapeMapper, rowsFitShape } from '../../src/agent/index.js';

// Rows that already ARE the shape skip the mapping agent: the identity IR,
// no model call. Everything else still maps.

describe('rowsFitShape', () => {
  it('fits a flat array shape whose keys and kinds the rows already have', () => {
    expect(rowsFitShape([{ name: 'Ada', count: 3 }], [{ name: '', count: 0 }])).toBe(true);
  });

  it('fits a single shape against the first row, and takes null for any kind', () => {
    expect(rowsFitShape([{ value: 40 }], { value: 0 })).toBe(true);
    expect(rowsFitShape([{ name: null, count: 3 }], [{ name: '', count: 0 }])).toBe(true);
  });

  it('does not fit a missing, extra or renamed column', () => {
    expect(rowsFitShape([{ name: 'Ada' }], [{ name: '', count: 0 }])).toBe(false);
    expect(rowsFitShape([{ name: 'Ada', count: 3, id: 'x' }], [{ name: '', count: 0 }])).toBe(false);
    expect(rowsFitShape([{ peopleCount: 40 }], { value: 0 })).toBe(false);
  });

  it('does not fit a value of another kind — a count that came back as text maps', () => {
    expect(rowsFitShape([{ value: '40' }], { value: 0 })).toBe(false);
  });

  it('does not fit a nested shape', () => {
    expect(rowsFitShape([{ person: 'Ada' }], [{ person: { name: '' } }])).toBe(false);
  });

  it('does not fit no rows: there is nothing to prove the columns by', () => {
    expect(rowsFitShape([], [{ name: '' }])).toBe(false);
  });
});

describe('createShapeMapper', () => {
  // A client that fails the test if the mapper ever asks it anything.
  const called = (): never => {
    throw new Error('the model was called');
  };
  const untouchable: SignalClient = { step: called, stepStream: called, count: called, describe: called };

  it('returns the identity for fitting rows without calling the model', async () => {
    const mapper = createShapeMapper(untouchable);
    const rows = [{ name: 'Ada', count: 3 }, { name: 'Ben', count: 1 }];
    const { transformed } = await mapper(rows, [{ name: '', count: 0 }]);
    expect(transformed).toEqual(rows);
  });

  it('returns the single row for a fitting single shape', async () => {
    const mapper = createShapeMapper(untouchable);
    const { transformed } = await mapper([{ value: 40 }], { value: 0 });
    expect(transformed).toEqual({ value: 40 });
  });
});
