import { describe, it, expect } from 'vitest';
import { compile, execute, evaluate } from '../src';

// ═══════════════════════════════════════════════════════════
// Optimizer tests — verify that compile() actually does the
// three optimizations and that execute() produces the same
// answer as evaluate().
// ═══════════════════════════════════════════════════════════

describe('compile — constant folding', () => {
  it('folds a pure-literal $add expression to a single $const', async () => {
    const ir = await compile({ $add: [{ $const: 2 }, { $const: 3 }] });
    expect(ir.meta.stats.optimizations.constantsFolded).toBeGreaterThanOrEqual(1);
    // The fold replaces the $add with {$const: 5}; nodeCount drops
    expect(ir.meta.stats.nodeCount).toBeLessThanOrEqual(4);
  });

  it('folds nested literal arithmetic', async () => {
    const ir = await compile({
      $add: [{ $mul: [{ $const: 6 }, { $const: 7 }] }, { $const: 0 }],
    });
    expect(ir.meta.stats.optimizations.constantsFolded).toBeGreaterThanOrEqual(2);
    const result = execute(ir, {});
    expect(result).toBe(42);
  });

  it('does NOT fold an expression that depends on $ref', async () => {
    const ir = await compile({ $add: [{ $ref: '$.x' }, { $const: 1 }] });
    expect(ir.meta.stats.optimizations.constantsFolded).toBe(0);
  });

  it('does NOT fold an expression that depends on $var', async () => {
    const ir = await compile({
      $with: {
        let: { x: { $const: 10 } },
        value: { $add: [{ $var: 'x' }, { $const: 1 }] },
      },
    });
    expect(ir.meta.stats.optimizations.constantsFolded).toBe(0);
  });

  it('folds $const itself is a no-op (stays as $const)', async () => {
    const ir = await compile({ $const: 42 });
    expect(ir.meta.stats.optimizations.constantsFolded).toBe(0);
    expect(execute(ir, {})).toBe(42);
  });
});

describe('compile — handler attachment', () => {
  it('attaches a handler to every recognized op node', async () => {
    const ir = await compile({
      $map: {
        over: { $ref: '$.items' },
        as: 'item',
        body: { $get: { from: { $var: 'item' }, path: ['name'] } },
      },
    });
    // 4 ops: $map, $ref, $get, $var
    expect(ir.meta.stats.optimizations.handlersAttached).toBe(4);
  });

  it('runs the same way as evaluate() for a complex config', async () => {
    const config = {
      $sortBy: {
        over: {
          $filter: {
            over: { $ref: '$.users' },
            as: 'u',
            when: { $gte: [{ $get: { from: { $var: 'u' }, path: ['age'] } }, { $const: 18 }] },
          },
        },
        as: 'u',
        by: { $get: { from: { $var: 'u' }, path: ['age'] } },
        dir: 'asc',
      },
    };
    const source = {
      users: [
        { name: 'Ada', age: 36 },
        { name: 'Kid', age: 12 },
        { name: 'Grace', age: 42 },
        { name: 'Linus', age: 25 },
      ],
    };
    const directResult = evaluate(config, source);
    const ir = await compile(config);
    const compiledResult = execute(ir, source);
    expect(compiledResult).toEqual(directResult);
  });
});

describe('compile — $ref segment inlining', () => {
  it('inlines parsed segments for every $ref', async () => {
    const ir = await compile({
      a: { $ref: '$.user.name' },
      b: { $ref: '$.user.email' },
      c: { $ref: '$.items[0].sku' },
    });
    expect(ir.meta.stats.optimizations.refsInlined).toBe(3);
  });

  it('still resolves correctly after inlining', async () => {
    const ir = await compile({ name: { $ref: '$.user.name' } });
    const result = execute(ir, { user: { name: 'Ada' } });
    expect(result).toEqual({ name: 'Ada' });
  });
});

describe('compile — fingerprint stability', () => {
  it('produces the same fingerprint regardless of optimization', async () => {
    // Two identical configs should have the same fingerprint
    const a = await compile({ $add: [{ $const: 1 }, { $const: 2 }] });
    const b = await compile({ $add: [{ $const: 1 }, { $const: 2 }] });
    expect(a.meta.fingerprint).toBe(b.meta.fingerprint);
  });
});

describe('execute — equivalence with evaluate', () => {
  const source = {
    user: { name: 'Ada', age: 36 },
    items: [
      { sku: 'A1', price: 10 },
      { sku: 'A2', price: 20 },
      { sku: 'A3', price: 30 },
    ],
  };

  const cases: { name: string; config: unknown }[] = [
    { name: 'simple ref', config: { $ref: '$.user.name' } },
    { name: 'arithmetic', config: { $add: [{ $const: 1 }, { $const: 2 }] } },
    { name: 'map + get', config: {
      $map: {
        over: { $ref: '$.items' },
        as: 'i',
        body: { $get: { from: { $var: 'i' }, path: ['sku'] } },
      },
    }},
    { name: 'sum (sugar)', config: {
      $sum: { over: { $map: {
        over: { $ref: '$.items' }, as: 'i',
        body: { $get: { from: { $var: 'i' }, path: ['price'] } },
      }}},
    }},
  ];

  for (const c of cases) {
    it(`execute equals evaluate: ${c.name}`, async () => {
      const direct = evaluate(c.config, source);
      const ir = await compile(c.config);
      const compiled = execute(ir, source);
      expect(compiled).toEqual(direct);
    });
  }
});
