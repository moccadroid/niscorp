import { describe, it, expect } from 'vitest';
import { encodeDelta, applyDelta, frameHash } from '../src/delta';

// A frame is a serialized `render` message: long, repetitive, and mostly
// unchanged between sends. These build that shape rather than testing on toy
// strings, because the whole question is how the encoder behaves on a tree.
const row = (id: number, name: string, status: string): string =>
  JSON.stringify({ type: 'component', name: 'Row', props: { id: `mem_${id}`, name, status } });

const frame = (canvas: string, rows: string[]): string => `{"type":"render","canvas":"${canvas}","tree":[${rows.join(',')}]}`;

const roll = (statuses: string[]): string => frame('main', statuses.map((status, i) => row(i, `Person ${i}`, status)));

describe('delta — send what changed, not the frame', () => {
  it('round-trips an unchanged frame', () => {
    const text = roll(['active', 'active', 'paused']);
    expect(applyDelta(text, encodeDelta(text, text))).toBe(text);
  });

  it('round-trips a one-cell change', () => {
    const before = roll(['active', 'active', 'paused']);
    const after = roll(['active', 'cancelled', 'paused']);
    expect(applyDelta(before, encodeDelta(before, after))).toBe(after);
  });

  it('round-trips a frame with nothing in common', () => {
    const before = roll(['active', 'active']);
    const after = '{"type":"render","canvas":"main","tree":[]}';
    expect(applyDelta(before, encodeDelta(before, after))).toBe(after);
  });

  it('round-trips against an empty base', () => {
    const after = roll(['active']);
    expect(applyDelta('', encodeDelta('', after))).toBe(after);
  });

  it('round-trips an empty target', () => {
    expect(applyDelta(roll(['active']), encodeDelta(roll(['active']), ''))).toBe('');
  });

  it('round-trips rows appended, removed, and reordered', () => {
    const base = roll(['active', 'paused', 'cancelled']);
    for (const after of [roll(['active', 'paused', 'cancelled', 'active']), roll(['active']), roll(['cancelled', 'paused', 'active'])]) {
      expect(applyDelta(base, encodeDelta(base, after))).toBe(after);
    }
  });

  // The reason the layer exists. An in-place change to one row must cost a
  // fraction of the frame, or the encode is work for nothing.
  it('an in-place change costs a small fraction of the frame', () => {
    const before = roll(Array.from({ length: 60 }, () => 'active'));
    const after = roll(Array.from({ length: 60 }, (_, i) => (i === 30 ? 'cancelled' : 'active')));
    const encoded = JSON.stringify(encodeDelta(before, after));
    expect(encoded.length).toBeLessThan(after.length * 0.1);
  });

  // Non-ASCII is the case a naive byte-oriented encoder gets wrong: the
  // encoder indexes UTF-16 code units, so a copy must never split a character.
  it('round-trips frames carrying non-ASCII and emoji', () => {
    const before = frame('main', [row(0, 'Zoë Müller', 'active'), row(1, '横浜 🏋️', 'paused')]);
    const after = frame('main', [row(0, 'Zoë Müller', 'paused'), row(1, '横浜 🏋️', 'paused')]);
    const rebuilt = applyDelta(before, encodeDelta(before, after));
    expect(rebuilt).toBe(after);
    expect(JSON.parse(rebuilt)).toEqual(JSON.parse(after));
  });

  // A malformed op must throw rather than return a half-built frame: a silently
  // wrong frame is the one failure this layer cannot have.
  it('refuses a copy that runs past the base', () => {
    expect(() => applyDelta('short base', [[0, 0, 999]])).toThrow(/outside a base/);
    expect(() => applyDelta('short base', [[0, -1, 2]])).toThrow(/outside a base/);
  });

  describe('frameHash', () => {
    it('agrees with itself and disagrees on a one-character change', () => {
      const text = roll(['active', 'paused']);
      expect(frameHash(text)).toBe(frameHash(roll(['active', 'paused'])));
      expect(frameHash(text)).not.toBe(frameHash(roll(['active', 'pausee'])));
    });

    it('is order-sensitive — a transposition is a different frame', () => {
      expect(frameHash('ab')).not.toBe(frameHash('ba'));
    });

    it('is an unsigned 32-bit number', () => {
      const hash = frameHash(roll(['active']));
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    });
  });
});
