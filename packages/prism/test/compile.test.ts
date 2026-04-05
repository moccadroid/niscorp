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
