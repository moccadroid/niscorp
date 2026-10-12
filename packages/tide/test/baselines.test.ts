import { describe, expect, it } from 'vitest';
import { checksumOf } from '@niscorp/strata';
import { TIDE_SEQUENCE } from '../src/store/postgres';

// Red here means an applied migration changed. Do not re-pin the checksum: put the change
// back, and append a new migration to the sequence.

const PINNED: ReadonlyArray<[number, number, string]> = [
  [1, 16, '41f565e0faf179237fb6b92ca50f6266677871a4965e61bc3494a1d59d9c541b'],
  [2, 2, '0d96ed434e28052b5530e4bacd810cd7a0a135671bf4ecd0b18d1eeffd692e7a'],
];

describe('baselines — applied migrations are history', () => {
  it('the sequence is the one every ledger has: its id, and how many migrations', () => {
    expect(TIDE_SEQUENCE.id).toBe('nisc.moss.tide');
    expect(TIDE_SEQUENCE.migrations).toHaveLength(PINNED.length);
  });

  it.each(PINNED.map(([n, steps, checksum]) => [`${TIDE_SEQUENCE.id}/${n}`, n, steps, checksum] as const))('%s is unchanged', async (_ref, n, steps, checksum) => {
    const migration = TIDE_SEQUENCE.migrations[n - 1];
    expect(migration).toBeDefined();
    if (migration === undefined) return;
    expect(migration.steps).toHaveLength(steps);
    expect(await checksumOf(migration)).toBe(checksum);
  });
});
