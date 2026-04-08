import { describe, expect, it } from 'vitest';
import { applyMutation } from '@action/mutations';

describe('applyMutation — toggle', () => {
  it('flips true to false', () => {
    expect(applyMutation({ open: true }, { toggle: 'open' })).toEqual({ open: false });
  });
  it('flips false to true', () => {
    expect(applyMutation({ open: false }, { toggle: 'open' })).toEqual({ open: true });
  });
  it('treats missing as true', () => {
    expect(applyMutation({}, { toggle: 'open' })).toEqual({ open: true });
  });
});
