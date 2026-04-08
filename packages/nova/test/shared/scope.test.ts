import { describe, expect, it } from 'vitest';
import { createScopeChain, pushScope } from '@shared';

describe('scope chain', () => {
  it('creates a chain from data', () => {
    const chain = createScopeChain({ a: 1 });
    expect(chain).toEqual([{ a: 1 }]);
  });

  it('pushes a new scope to the front', () => {
    const chain = createScopeChain({ a: 1 });
    const next = pushScope(chain, { b: 2 });
    expect(next).toEqual([{ b: 2 }, { a: 1 }]);
  });

  it('does not mutate original on push', () => {
    const chain = createScopeChain({ a: 1 });
    pushScope(chain, { b: 2 });
    expect(chain).toEqual([{ a: 1 }]);
  });
});
