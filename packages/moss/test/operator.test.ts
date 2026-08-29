import { describe, it, expect } from 'vitest';
import { secretsEqual } from '../src/server';

// ═══════════════════════════════════════════════════════════════
// The operator key check is constant-time. secretsEqual hashes both sides to a
// fixed width before comparing, so a wrong or short guess is not refused faster
// than a correct-length one — and timingSafeEqual, which throws on a length
// mismatch, is always handed two equal-width digests.
// ═══════════════════════════════════════════════════════════════

describe('secretsEqual — constant-time credential compare', () => {
  it('accepts an exact match', () => {
    expect(secretsEqual('st_operator_key', 'st_operator_key')).toBe(true);
  });

  it('rejects a wrong key of the same length', () => {
    expect(secretsEqual('st_operator_key', 'st_operator_kez')).toBe(false);
  });

  it('rejects a differing-length guess WITHOUT throwing', () => {
    // The whole reason for hashing both sides first: timingSafeEqual throws on a
    // length mismatch, so a bare compare would refuse a short guess by crashing
    // (and a length pre-check would leak the key's length). Neither happens.
    expect(() => secretsEqual('short', 'a-considerably-longer-guess-entirely')).not.toThrow();
    expect(secretsEqual('short', 'a-considerably-longer-guess-entirely')).toBe(false);
  });
});
