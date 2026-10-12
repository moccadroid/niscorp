import { describe, it, expect } from 'vitest';
import { NodeSchema, ConfigSchema } from '@niscorp/prism';
import { parse, toNova } from '../src/index.js';
import type { Field } from '../src/compile/types.js';

describe('prism NodeSchema is Loom-editable', () => {
  const ir = parse(NodeSchema);

  it('parses into a recursive union, not the raw fallback', () => {
    expect(ir.kind).toBe('union');
    expect(ir.kind === 'union' && ir.recursive).toBe(true);
  });

  it('discriminates every op by its $key, primitives by type, plus one fallback', () => {
    if (ir.kind !== 'union') throw new Error('not a union');
    const kinds = new Set(ir.variants.map((v) => v.pattern.kind));
    expect(kinds).toContain('key');
    expect(kinds).toContain('type');
    expect(kinds).toContain('fallback');

    const types = ir.variants.filter((v) => v.pattern.kind === 'type').map((v) => (v.pattern as { type: string }).type);
    expect(types).toEqual(expect.arrayContaining(['string', 'number', 'array']));

    const keys = ir.variants.filter((v) => v.pattern.kind === 'key').map((v) => (v.pattern as { key: string }).key);
    expect(keys).toContain('$pick');
    expect(keys.length).toBeGreaterThan(40);

    expect(ir.variants.filter((v) => v.pattern.kind === 'fallback')).toHaveLength(1);
  });

  it('compiles to a Nova editor whose document value is preserved', () => {
    const config = { $pick: { from: { $ref: '$.user' }, keys: ['id', 'name'] } };
    const { action } = toNova(parse(NodeSchema), { id: 'prism', value: config as Record<string, unknown> });
    expect(action.data).toEqual(config);
    expect(JSON.stringify(action.layout)).toContain('loom:variant');
  });

  it('rootKey wraps the union under a bindable path (a non-object root binds $.key, not $)', () => {
    const config = { $pick: { from: { $ref: '$.user' }, keys: ['id', 'name'] } };
    const { action } = toNova(parse(NodeSchema), {
      id: 'prism',
      value: config as Record<string, unknown>,
      rootKey: '$root',
    });
    expect(action.data).toEqual({ $root: config });
    expect((action.layout as { model?: string }).model).toBe('$.$root');
  });

  it('ConfigSchema (NodeSchema.describe) is also a union', () => {
    expect(parse(ConfigSchema).kind).toBe('union');
  });

  it('the prism:node widget claims the root, so the whole config is one bound control', () => {
    const config = { $pick: { from: { $ref: '$.user' }, keys: ['id'] } };
    const { action } = toNova(parse(NodeSchema), {
      id: 'prism',
      rootKey: '$root',
      value: config as Record<string, unknown>,
      widgets: [{ role: 'prism:node', match: (field) => field.kind === 'union' && field.path === '' }],
    });
    expect(action.layout).toEqual({ component: 'prism:node', model: '$.$root' });
    expect(action.data).toEqual({ $root: config });
  });
});
