import { describe, it, expect } from 'vitest';
import { fuzzyCount, exactCount, counterFor } from '../../src/context/tokens';
import type { ContentChunk } from '../../src/schemas';

const chunk = (content: string): ContentChunk => ({
  role: 'system',
  content,
  source: 'test',
});

describe('fuzzyCount', () => {
  it('estimates ~4 chars per token plus overhead', () => {
    const count = fuzzyCount(chunk('Hello world, this is a test message.'));
    // 35 chars / 4 ≈ 9 + 4 overhead = ~13
    expect(count).toBeGreaterThan(8);
    expect(count).toBeLessThan(20);
  });

  it('returns overhead for empty content', () => {
    // Empty string → 0 chars / 4 = 0 + 4 overhead = 4
    expect(fuzzyCount(chunk(''))).toBe(4);
  });

  it('handles short strings', () => {
    const count = fuzzyCount(chunk('Hi'));
    // 2 chars / 4 = 1 + 4 overhead = 5
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

describe('exactCount', () => {
  it('falls back to fuzzy (same result)', () => {
    const c = chunk('Hello world, this is a test.');
    expect(exactCount(c)).toBe(fuzzyCount(c));
  });
});

describe('counterFor', () => {
  it('returns fuzzyCount for fuzzy mode', () => {
    const counter = counterFor('fuzzy');
    const c = chunk('Test');
    expect(counter(c)).toBe(fuzzyCount(c));
  });

  it('returns exactCount for exact mode', () => {
    const counter = counterFor('exact');
    const c = chunk('Test');
    expect(counter(c)).toBe(exactCount(c));
  });
});
