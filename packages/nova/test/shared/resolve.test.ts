import { describe, expect, it } from 'vitest';
import { createScopeChain, pushScope, resolve } from '@shared';

describe('resolve — strings', () => {
  it('passes literal strings through', () => {
    expect(resolve('hello', createScopeChain({}))).toBe('hello');
  });

  it('returns raw value for bare $.path', () => {
    expect(resolve('$.foo', createScopeChain({ foo: 'bar' }))).toBe('bar');
  });

  it('returns raw value for nested $.user.name', () => {
    expect(resolve('$.user.name', createScopeChain({ user: { name: 'Ada' } }))).toBe('Ada');
  });

  it('returns innermost scope for $', () => {
    const chain = pushScope(createScopeChain({ a: 1 }), { b: 2 });
    expect(resolve('$', chain)).toEqual({ b: 2 });
  });

  it('returns raw variable value for $var', () => {
    const chain = pushScope(createScopeChain({}), { item: { price: 9 } });
    expect(resolve('$item', chain)).toEqual({ price: 9 });
    expect(resolve('$item.price', chain)).toBe(9);
  });

  it('walks scope chain innermost first', () => {
    const chain = pushScope(createScopeChain({ x: 'outer' }), { x: 'inner' });
    expect(resolve('$.x', chain)).toBe('inner');
  });

  it('returns raw value for sole {{ expr }} (type preserved)', () => {
    expect(resolve('{{$.n}}', createScopeChain({ n: 42 }))).toBe(42);
  });

  it('handles whitespace in sole {{ expr }}', () => {
    expect(resolve('{{ $.n }}', createScopeChain({ n: 42 }))).toBe(42);
  });

  it('interpolates a single template variable', () => {
    expect(resolve('Hello {{$.name}}', createScopeChain({ name: 'World' }))).toBe('Hello World');
  });

  it('interpolates multiple variables', () => {
    expect(resolve('{{$.a}} and {{$.b}}', createScopeChain({ a: '1', b: '2' }))).toBe('1 and 2');
  });

  it('renders missing path as empty string in templates', () => {
    expect(resolve('X={{$.missing}}', createScopeChain({}))).toBe('X=');
  });

  it('treats "$5" as literal (not a path)', () => {
    expect(resolve('$5', createScopeChain({}))).toBe('$5');
  });

  it('stringifies numbers/booleans in templates', () => {
    expect(resolve('n={{$.n}}', createScopeChain({ n: 42 }))).toBe('n=42');
    expect(resolve('b={{$.b}}', createScopeChain({ b: true }))).toBe('b=true');
  });
});

describe('resolve — arrays and objects', () => {
  it('maps arrays recursively', () => {
    expect(resolve(['{{$.x}}', 'y'], createScopeChain({ x: 'X' }))).toEqual(['X', 'y']);
  });

  it('walks nested objects', () => {
    expect(
      resolve(
        { a: '{{$.x}}', b: { c: 'lit', d: '{{$.y}}' } },
        createScopeChain({ x: 1, y: 2 }),
      ),
    ).toEqual({ a: 1, b: { c: 'lit', d: 2 } });
  });
});

describe('resolve — $if directive', () => {
  it('returns $then when condition truthy', () => {
    expect(
      resolve(
        { $if: '$.flag', $then: 'yes', $else: 'no' },
        createScopeChain({ flag: true }),
      ),
    ).toBe('yes');
  });

  it('returns $else when condition falsy', () => {
    expect(
      resolve(
        { $if: '$.flag', $then: 'yes', $else: 'no' },
        createScopeChain({ flag: false }),
      ),
    ).toBe('no');
  });

  it('returns undefined when $else missing and condition falsy', () => {
    expect(resolve({ $if: '$.flag', $then: 'yes' }, createScopeChain({ flag: false }))).toBeUndefined();
  });

  it('recursively resolves branches', () => {
    expect(
      resolve(
        { $if: '$.on', $then: 'v={{$.v}}', $else: 'off' },
        createScopeChain({ on: true, v: 7 }),
      ),
    ).toBe('v=7');
  });

  it('nested directives', () => {
    expect(
      resolve(
        { $if: '$.a', $then: { $if: '$.b', $then: 'AB', $else: 'A' }, $else: 'X' },
        createScopeChain({ a: true, b: false }),
      ),
    ).toBe('A');
  });

  it('directive inside an array', () => {
    expect(
      resolve(
        ['x', { $if: '$.show', $then: 'y', $else: 'n' }],
        createScopeChain({ show: true }),
      ),
    ).toEqual(['x', 'y']);
  });

  it('directive inside an object value', () => {
    expect(
      resolve(
        { label: { $if: '$.on', $then: 'On', $else: 'Off' } },
        createScopeChain({ on: false }),
      ),
    ).toEqual({ label: 'Off' });
  });
});

describe('resolve — truthiness rules', () => {
  it.each([
    [null, false],
    [undefined, false],
    [false, false],
    [0, false],
    ['', false],
    [[], false],
    ['x', true],
    [1, true],
    [true, true],
    [[1], true],
    [{}, true],
  ])('truthiness for %p → %p', (cond, expected) => {
    const chain = createScopeChain({ v: cond });
    const out = resolve({ $if: '$.v', $then: 'T', $else: 'F' }, chain);
    expect(out).toBe(expected ? 'T' : 'F');
  });
});

describe('resolve — extras (@error)', () => {
  it('works in interpolated strings', () => {
    expect(
      resolve('err: {{@error.message}}', createScopeChain({}), { '@error': { message: 'boom' } }),
    ).toBe('err: boom');
  });

  it('works in sole template form', () => {
    expect(
      resolve('{{@error}}', createScopeChain({}), { '@error': { code: 1 } }),
    ).toEqual({ code: 1 });
  });

  it('works inside $if directive', () => {
    expect(
      resolve(
        { $if: '@error', $then: '{{@error.message}}', $else: 'ok' },
        createScopeChain({}),
        { '@error': { message: 'boom' } },
      ),
    ).toBe('boom');
  });
});

describe('resolve — primitives', () => {
  it('passes through numbers', () => {
    expect(resolve(7, createScopeChain({}))).toBe(7);
  });
  it('passes through booleans', () => {
    expect(resolve(true, createScopeChain({}))).toBe(true);
    expect(resolve(false, createScopeChain({}))).toBe(false);
  });
  it('passes through null/undefined', () => {
    expect(resolve(null, createScopeChain({}))).toBe(null);
    expect(resolve(undefined, createScopeChain({}))).toBe(undefined);
  });
});

describe('resolve — uniform integration', () => {
  it('$if works uniformly in layout-style prop value and emit-style payload', () => {
    const chain = createScopeChain({ flag: true, name: 'Ada' });
    const propValue = resolve(
      { $if: '$.flag', $then: '{{$.name}}', $else: 'guest' },
      chain,
    );
    expect(propValue).toBe('Ada');

    const emitPayload = resolve(
      { user: { $if: '$.flag', $then: '$.name', $else: null } },
      chain,
    );
    expect(emitPayload).toEqual({ user: 'Ada' });
  });

  it('Hello {{$.name}} works uniformly in prop value and endpoint URL', () => {
    const chain = createScopeChain({ name: 'World' });
    expect(resolve('Hello {{$.name}}', chain)).toBe('Hello World');
    expect(resolve('/api/users/{{$.name}}', chain)).toBe('/api/users/World');
  });
});
