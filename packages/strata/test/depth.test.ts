import { describe, expect, it } from 'vitest';
import { DOCUMENT_DEPTH_LIMIT, exceedsDepth } from '../src';

const nested = (depth: number): unknown => {
  let value: unknown = 'leaf';
  for (let i = 0; i < depth; i++) value = i % 2 === 0 ? { inner: value } : [value];
  return value;
};

describe('exceedsDepth', () => {
  it('counts every object and array level, up to and past the limit', () => {
    expect(exceedsDepth(nested(DOCUMENT_DEPTH_LIMIT))).toBe(false);
    expect(exceedsDepth(nested(DOCUMENT_DEPTH_LIMIT + 1))).toBe(true);
  });

  it('scalars have no depth', () => {
    expect(exceedsDepth('text')).toBe(false);
    expect(exceedsDepth(null)).toBe(false);
  });

  it('walks without recursing: a document far past any stack answers', () => {
    expect(exceedsDepth(nested(200_000))).toBe(true);
  });

  it('takes a limit', () => {
    expect(exceedsDepth(nested(3), 2)).toBe(true);
    expect(exceedsDepth(nested(2), 2)).toBe(false);
  });
});
