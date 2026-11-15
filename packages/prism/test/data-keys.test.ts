import { describe, it, expect } from 'vitest';
import { evaluate, evaluateSafe, execute, ErrorCode, type CompiledIr, type JsonValue } from '../src';

const protoKey = (inner: string): { [key: string]: JsonValue } => JSON.parse(`{"__proto__":${inner}}`);

const codeOf = (config: unknown, source: unknown): string | undefined => {
  const result = evaluateSafe(config, source);
  if (result.ok) return undefined;
  return 'code' in result.error ? String(result.error.code) : 'no code';
};

describe('a key the data does not have is not read from Object.prototype', () => {
  it('$ref to $.constructor on {} is a missing path', () => {
    expect(codeOf({ $ref: '$.constructor' }, {})).toBe(ErrorCode.MISSING_PATH);
  });

  it('$var toString is a variable that is not in scope', () => {
    expect(codeOf({ $var: 'toString' }, {})).toBe(ErrorCode.VAR_NOT_FOUND);
  });

  it('$get with the path ["constructor"] answers its fallback', () => {
    expect(evaluate({ $get: { from: { $const: {} }, path: ['constructor'], fallback: 'none' } }, {})).toBe('none');
  });

  it('$pick of constructor from an object without it picks nothing', () => {
    expect(evaluate({ $pick: { from: { $const: { a: 1 } }, keys: ['constructor'] } }, {})).toEqual({});
  });

  it('$interpolate leaves {{constructor}} empty when values has no such key', () => {
    expect(evaluate({ $interpolate: { template: 'x{{constructor}}y', values: { $const: {} } } }, {})).toBe('xy');
  });

  it('$fill leaves {constructor} as written when slots has no such key', () => {
    expect(evaluate({ $fill: { $const: { phrase: 'a {constructor}', slots: {} } } }, {})).toBe('a {constructor}');
  });

  it('$renameKeys keeps a data key called constructor', () => {
    expect(evaluate({ $renameKeys: { from: { $ref: '$' }, map: { a: 'b' } } }, { constructor: 1, a: 2 })).toEqual({ constructor: 1, b: 2 });
  });

  it('$update reads null at a key the data does not have', () => {
    expect(evaluate({ $update: { from: { $const: {} }, path: ['toString'], value: { $type: { $var: 'current' } } } }, {})).toEqual({ toString: 'null' });
  });
});

describe('$groupBy groups under any text key', () => {
  it('groups under constructor, toString, valueOf and __proto__', () => {
    const over = ['constructor', 'toString', 'valueOf', '__proto__', 'constructor'];
    const result = evaluateSafe({ $groupBy: { over: { $const: over }, as: 'k', key: { $var: 'k' } } }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.data)).toBe('{"constructor":["constructor","constructor"],"toString":["toString"],"valueOf":["valueOf"],"__proto__":["__proto__"]}');
  });
});

describe('a key called __proto__ stays a key of the result', () => {
  const payload = protoKey('{"isAdmin":true}');
  const kept = '{"__proto__":{"isAdmin":true}}';

  it('in $merge', () => {
    const result = evaluate({ $merge: [{ $ref: '$' }] }, payload);
    expect(JSON.stringify(result)).toBe(kept);
    expect(Reflect.get(Object(result), 'isAdmin')).toBeUndefined();
  });

  it('in $omit', () => {
    const result = evaluate({ $omit: { from: { $ref: '$' }, keys: ['other'] } }, payload);
    expect(JSON.stringify(result)).toBe(kept);
    expect(Reflect.get(Object(result), 'isAdmin')).toBeUndefined();
  });

  it('in $pick', () => {
    expect(JSON.stringify(evaluate({ $pick: { from: { $ref: '$' }, keys: ['__proto__'] } }, payload))).toBe(kept);
  });

  it('in $keyBy', () => {
    const result = evaluate({ $keyBy: { over: { $const: [{ id: '__proto__', isAdmin: true }] }, as: 'r', key: { $get: { from: { $var: 'r' }, path: ['id'] } } } }, {});
    expect(JSON.stringify(result)).toBe('{"__proto__":{"id":"__proto__","isAdmin":true}}');
  });

  it('in $fromEntries', () => {
    const result = evaluate({ $fromEntries: { $const: [['__proto__', { isAdmin: true }]] } }, {});
    expect(JSON.stringify(result)).toBe(kept);
  });

  it('in $renameKeys, renamed to __proto__', () => {
    const result = evaluate({ $renameKeys: { from: { $const: { a: { isAdmin: true } } }, map: { a: '__proto__' } } }, {});
    expect(JSON.stringify(result)).toBe(kept);
  });

  it('read by $ref and $get', () => {
    expect(evaluate({ $ref: '$.__proto__.isAdmin' }, payload)).toBe(true);
    expect(evaluate({ $get: { from: { $ref: '$' }, path: ['__proto__', 'isAdmin'] } }, payload)).toBe(true);
  });

  it('in a template of a stored IR', () => {
    const core = protoKey('{"isAdmin":{"$ref":"$.flag"}}');
    const ir: CompiledIr = { irVersion: 1, compiler: { name: '@niscorp/prism', version: 'dev' }, meta: { createdAt: '', fingerprint: '', stats: { nodeCount: 0, opCount: {}, maxDepth: 0, optimizations: { refsInlined: 0, handlersAttached: 0, constantsFolded: 0 } } }, tables: { paths: [], strings: [] }, core };
    expect(JSON.stringify(execute(ir, { flag: true }))).toBe(kept);
  });

  it('as a loop variable', () => {
    expect(evaluate({ $map: { over: { $const: [1, 2] }, as: '__proto__', body: { $var: '__proto__' } } }, {})).toEqual([1, 2]);
  });
});
