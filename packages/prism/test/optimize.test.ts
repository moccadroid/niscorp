import { describe, it, expect } from 'vitest';
import { compile, execute, evaluate, prismTransform, type JsonObject } from '../src';

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

describe('execute — an IR read back from storage', () => {
  // The annotations are non-enumerable, so JSON (a jsonb row, a file) drops
  // them. execute() must restore them rather than run the slow chain forever.
  const stored = async (config: unknown): Promise<Awaited<ReturnType<typeof compile>>> =>
    JSON.parse(JSON.stringify(await compile(config)));

  it('restores the handler and ref annotations on first execute', async () => {
    const ir = await stored({ $map: { over: { $ref: '$.rows' }, as: 'r', body: { $upper: { $var: 'r' } } } });
    const core = ir.core as Record<string, unknown>;
    expect(Object.getOwnPropertyDescriptor(core, '__op')).toBeUndefined();

    expect(execute(ir, { rows: ['a', 'b'] })).toEqual(['A', 'B']);

    const op = Object.getOwnPropertyDescriptor(core, '__op');
    expect(typeof op?.value).toBe('function');
    expect(op?.enumerable).toBe(false);
    const map = core['$map'] as Record<string, unknown>;
    const segments = Object.getOwnPropertyDescriptor(map['over'], '__segments');
    expect(Array.isArray(segments?.value)).toBe(true);
    // Still pure JSON on the way back out.
    expect(JSON.stringify(ir.core)).toBe(JSON.stringify((await compile({ $map: { over: { $ref: '$.rows' }, as: 'r', body: { $upper: { $var: 'r' } } } })).core));
  });

  it('never annotates the data inside a $const it hands back', async () => {
    const ir = await stored({ $const: { $ref: '$.looks-like-an-op', nested: [{ $upper: 'x' }] } });
    const out = execute(ir, {}) as Record<string, unknown>;
    expect(out).toEqual({ $ref: '$.looks-like-an-op', nested: [{ $upper: 'x' }] });
    expect(Object.getOwnPropertyNames(out)).toEqual(['$ref', 'nested']);
    const nested = (out['nested'] as unknown[])[0] as object;
    expect(Object.getOwnPropertyNames(nested)).toEqual(['$upper']);
  });

  it('answers exactly as the freshly compiled IR does', async () => {
    const config = {
      $map: {
        over: { $ref: '$.items' }, as: 'it',
        body: { name: { $get: { from: { $var: 'it' }, path: ['name'] } }, big: { $gt: [{ $get: { from: { $var: 'it' }, path: ['n'] } }, 5] } },
      },
    };
    const source = { items: [{ name: 'a', n: 3 }, { name: 'b', n: 9 }] };
    expect(execute(await stored(config), source)).toEqual(execute(await compile(config), source));
  });
});

// A `$with` binding and a `$renameKeys` map are keyed by NAMES, and a `$const`
// holds DATA; a `$` key among them may be an op's name. The optimizer read such
// a record as that op, and the desugar step read a sugar op's name as sugar.
describe('a name or a constant that looks like an op', () => {
  const stored = async (config: unknown): Promise<Awaited<ReturnType<typeof compile>>> =>
    JSON.parse(JSON.stringify(await compile(config)));

  const cases: { name: string; config: unknown; source: JsonObject; expected: unknown }[] = [
    { name: 'a binding called $upper', config: { $with: { let: { $upper: 'x' }, value: { $var: '$upper' } } }, source: {}, expected: 'x' },
    { name: 'a binding called $ref, holding a number', config: { $with: { let: { $ref: 2 }, value: { $var: '$ref' } } }, source: {}, expected: 2 },
    { name: 'a binding called $ref, holding a ref', config: { $with: { let: { $ref: { $ref: '$.a' } }, value: { $var: '$ref' } } }, source: { a: 7 }, expected: 7 },
    { name: 'a key called $upper, renamed', config: { $renameKeys: { from: { $ref: '$' }, map: { $upper: 'x' } } }, source: { $upper: 1, b: 2 }, expected: { x: 1, b: 2 } },
    { name: 'a key called $type, renamed', config: { $renameKeys: { from: { $ref: '$' }, map: { $type: 'kind' } } }, source: { $type: 'a' }, expected: { kind: 'a' } },
    // The sugar ops' names: the desugar step read these as sugar, in evaluate too.
    { name: 'a binding called $sum', config: { $with: { let: { $sum: [1, 2] }, value: { $var: '$sum' } } }, source: {}, expected: [1, 2] },
    { name: 'a binding called $const, whose value is sugar', config: { $with: { let: { $const: { $sum: { over: [1, 2] } } }, value: { $var: '$const' } } }, source: {}, expected: 3 },
    { name: 'a key called $count, renamed', config: { $renameKeys: { from: { $ref: '$' }, map: { $count: 'n' } } }, source: { $count: 1 }, expected: { n: 1 } },
    { name: 'sugar where a $renameKeys reads from', config: { $renameKeys: { from: { total: { $sum: { over: { $ref: '$.xs' } } } }, map: { total: 'sum' } } }, source: { xs: [1, 2, 3] }, expected: { sum: 6 } },
    // A $const is data, returned as it is written.
    { name: 'a constant with a $sum key', config: { $const: { total: { $sum: 1 } } }, source: {}, expected: { total: { $sum: 1 } } },
    { name: 'a constant that is a pipeline of $match and $count', config: { $const: [{ $match: { status: 'A' } }, { $count: 'n' }] }, source: {}, expected: [{ $match: { status: 'A' } }, { $count: 'n' }] },
    { name: 'a constant that is a Prism config', config: { $const: { $sum: { over: { $ref: '$.xs' } } } }, source: { xs: [1] }, expected: { $sum: { over: { $ref: '$.xs' } } } },
    { name: 'a constant with $take, $min and $max keys', config: { dose: { $const: { $take: 'two tablets', $min: 3, $max: 9 } } }, source: {}, expected: { dose: { $take: 'two tablets', $min: 3, $max: 9 } } },
  ];

  for (const c of cases) {
    it(`${c.name}: execute, a stored IR and prismTransform answer as evaluate does`, async () => {
      expect(evaluate(c.config, c.source)).toEqual(c.expected);
      expect(execute(await compile(c.config), c.source)).toEqual(c.expected);
      expect(execute(await stored(c.config), c.source)).toEqual(c.expected);
      expect(prismTransform(c.config, c.source)).toEqual(c.expected);
      expect(prismTransform(c.config, c.source)).toEqual(c.expected);
    });
  }
});

// Every execute of an IR hands out the IR's own constants. A caller that wrote
// to one changed what every later caller was given.
describe('a constant that a compiled config hands out', () => {
  const stored = async (config: unknown): Promise<Awaited<ReturnType<typeof compile>>> =>
    JSON.parse(JSON.stringify(await compile(config)));

  // tags: a constant as written. parts and merged: constants the compiler folded.
  const config = {
    tags: { $coalesce: [{ $get: { from: { $ref: '$' }, path: ['tags'], fallback: null } }, { $const: [] }] },
    parts: { $split: { value: 'a,b', sep: ',' } },
    merged: { $merge: [{ $const: { n: { deep: [1] } } }, { $const: { m: 2 } }] },
  };
  const expected = { tags: [], parts: ['a', 'b'], merged: { n: { deep: [1] }, m: 2 } };
  type Answer = { tags: string[]; parts: string[]; merged: { n: { deep: number[] }; m: number } };

  for (const [name, make] of [['a fresh IR', compile], ['an IR read back from storage', stored]] as const) {
    it(`${name}: writing to one throws, and the next answer is what it was`, async () => {
      const ir = await make(config);
      const first = execute(ir, {}) as Answer;
      expect(first).toEqual(expected);
      expect(() => first.tags.push('x')).toThrow(TypeError);
      expect(() => first.parts.push('x')).toThrow(TypeError);
      expect(() => { first.merged.m = 9; }).toThrow(TypeError);
      expect(() => first.merged.n.deep.push(2)).toThrow(TypeError);
      expect(execute(ir, {})).toEqual(expected);
    });
  }

  it('what is built for each call is still the caller\'s to change', async () => {
    const ir = await compile({ list: [{ $ref: '$.a' }], shape: { a: { $ref: '$.a' } }, mapped: { $map: { over: [1, 2], as: 'n', body: { $var: 'n' } } } });
    const answer = execute(ir, { a: 1 }) as { list: number[]; shape: Record<string, number>; mapped: number[] };
    answer.list.push(2);
    answer.shape['b'] = 2;
    answer.mapped.push(3);
    expect(execute(ir, { a: 1 })).toEqual({ list: [1], shape: { a: 1 }, mapped: [1, 2] });
  });

  it('evaluate and prismTransform answer with constants the caller may change, as they did', () => {
    const viaEvaluate = evaluate(config, {}) as Answer;
    viaEvaluate.tags.push('x');
    viaEvaluate.merged.n.deep.push(2);
    expect(evaluate(config, {})).toEqual(expected);
    const viaTransform = prismTransform(config, {}) as Answer;
    viaTransform.tags.push('x');
    viaTransform.merged.n.deep.push(2);
    expect(prismTransform(config, {})).toEqual(expected);
  });
});
