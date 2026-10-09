import { describe, it, expect } from 'vitest';
import { compile, execute } from '../src';

const source = {
  user: { name: 'Alice', age: 30 },
  numbers: [1, 2, 3],
};

describe('compile + execute', () => {
  it('compiles and executes a simple config', async () => {
    const config = { name: { $ref: '$.user.name' }, doubled: { $mul: [{ $ref: '$.user.age' }, { $const: 2 }] } };
    const ir = await compile(config);
    expect(ir.irVersion).toBe(1);
    expect(ir.compiler.name).toBe('@niscorp/prism');
    expect(ir.meta.fingerprint).toBeTruthy();
    expect(ir.meta.stats.nodeCount).toBeGreaterThan(0);
    expect(ir.tables.paths).toContain('$.user.name');
    expect(ir.tables.paths).toContain('$.user.age');

    const result = execute(ir, source);
    expect(result).toEqual({ name: 'Alice', doubled: 60 });
  });

  it('desugars before compiling', async () => {
    const config = { $sum: { over: { $ref: '$.numbers' } } };
    const ir = await compile(config);
    // After desugaring, $sum becomes $reduce — no $sum in opCount
    expect(ir.meta.stats.opCount['$reduce']).toBeGreaterThan(0);

    const result = execute(ir, source);
    expect(result).toBe(6);
  });

  it('includes compile options in IR', async () => {
    const ir = await compile({ $const: 1 }, { name: 'test', version: '1.0.0' });
    expect(ir.meta.name).toBe('test');
    expect(ir.compiler.version).toBe('1.0.0');
  });

  it('produces stable fingerprint for same config', async () => {
    const config = { $ref: '$.user.name' };
    const ir1 = await compile(config);
    const ir2 = await compile(config);
    expect(ir1.meta.fingerprint).toBe(ir2.meta.fingerprint);
  });
});

// A `$ref` key in a constant's data, or as a binding's name, is not a path the
// config reads. compile lists it in `tables.paths`; execute used to parse that
// list, and refused the config for it.
describe('execute — a $ref that is data, not a path', () => {
  const stored = async (config: unknown): Promise<Awaited<ReturnType<typeof compile>>> =>
    JSON.parse(JSON.stringify(await compile(config)));

  const cases: [string, unknown, unknown][] = [
    ['in a constant', { link: { $const: { $ref: '$.store.book[*].author' } } }, { link: { $ref: '$.store.book[*].author' } }],
    ['as the name of a binding', { $with: { let: { $ref: '$..deep' }, value: { $var: '$ref' } } }, '$..deep'],
  ];
  for (const [name, config, expected] of cases) {
    it(`${name}: a fresh IR and a stored one answer`, async () => {
      expect(execute(await compile(config), {})).toEqual(expected);
      expect(execute(await stored(config), {})).toEqual(expected);
    });
  }
});
