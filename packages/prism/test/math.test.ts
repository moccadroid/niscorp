import { describe, it, expect } from 'vitest';
import { compile, evaluate, execute, validate, PrismError } from '../src';

const source = { a: 10, b: 3 };

describe('$add', () => {
  it('adds two numbers', () => expect(evaluate({ $add: [{ $ref: '$.a' }, { $ref: '$.b' }] }, source)).toBe(13));
  it('adds with const', () => expect(evaluate({ $add: [{ $const: 5 }, { $const: 7 }] }, source)).toBe(12));
});

describe('$sub', () => {
  it('subtracts', () => expect(evaluate({ $sub: [{ $ref: '$.a' }, { $ref: '$.b' }] }, source)).toBe(7));
});

describe('$mul', () => {
  it('multiplies', () => expect(evaluate({ $mul: [{ $ref: '$.a' }, { $ref: '$.b' }] }, source)).toBe(30));
});

describe('$div', () => {
  it('divides', () => expect(evaluate({ $div: [{ $ref: '$.a' }, { $ref: '$.b' }] }, source)).toBeCloseTo(3.333));
  it('throws on division by zero', () => {
    expect(() => evaluate({ $div: [{ $const: 1 }, { $const: 0 }] }, source)).toThrow(PrismError);
  });
});

describe('$round', () => {
  it('rounds to 0 digits', () => expect(evaluate({ $round: { value: { $const: 3.7 } } }, source)).toBe(4));
  it('rounds to 2 digits', () => expect(evaluate({ $round: { value: { $const: 3.14159 }, digits: 2 } }, source)).toBe(3.14));
});

describe('$round — mode', () => {
  const round = (value: number, mode?: string, digits?: number): unknown =>
    evaluate({ $round: { value: { $const: value }, ...(digits === undefined ? {} : { digits }), ...(mode === undefined ? {} : { mode }) } } as never, source);

  it('rounds to the nearest unless told', () => {
    expect(round(2.5)).toBe(3);
    expect(round(2.5, 'nearest')).toBe(3);
    expect(round(-2.5)).toBe(-2);
  });
  it('floor rounds down, toward negative infinity', () => {
    expect(round(2.9, 'floor')).toBe(2);
    expect(round(-2.1, 'floor')).toBe(-3);
    expect(round(3.149, 'floor', 2)).toBe(3.14);
  });
  it('ceil rounds up', () => {
    expect(round(2.1, 'ceil')).toBe(3);
    expect(round(-2.9, 'ceil')).toBe(-2);
    expect(round(3.141, 'ceil', 2)).toBe(3.15);
  });
  it('refuses a mode it does not have', () => {
    expect(() => round(1, 'up')).toThrow(expect.objectContaining({ code: 'E_SCHEMA' }));
  });
  it('a config without a mode parses to what it did: no mode is written in', () => {
    expect(validate({ $round: { value: 1.5 } })).toEqual({ ok: true, data: { $round: { value: 1.5, digits: 0 } } });
  });
  it('rounds at the decimals as written, not at a binary product', () => {
    expect(round(1.1, 'ceil', 2)).toBe(1.1);
    expect(round(4.35, 'floor', 2)).toBe(4.35);
    expect(round(0.29, 'floor', 2)).toBe(0.29);
    expect(round(1.005, 'nearest', 2)).toBe(1.01);
    expect(round(0.285, 'nearest', 2)).toBe(0.29);
    expect(round(3.14159, 'nearest', 2)).toBe(3.14);
    expect(round(-2.5, 'nearest', 0)).toBe(-2);
  });
  it('more digits than a number has give the number', () => {
    expect(round(1.5, 'nearest', 400)).toBe(1.5);
    expect(round(1e300, 'nearest', 10)).toBe(1e300);
    expect(round(1.23e-7, 'floor', 8)).toBe(1.2e-7);
  });
});

describe('$mod', () => {
  const mod = (a: unknown, b: unknown): unknown => evaluate({ $mod: [{ $const: a }, { $const: b }] } as never, source);

  it('is the remainder', () => {
    expect(mod(7, 2)).toBe(1);
    expect(mod(10, 5)).toBe(0);
    expect(mod(7.5, 2)).toBe(1.5);
  });
  it('takes the sign of the divisor, so a bucket is never negative', () => {
    expect(mod(-1, 5)).toBe(4);
    expect(mod(-5, 5)).toBe(0);
    expect(mod(7, -2)).toBe(-1);
    expect(mod(-7, -2)).toBe(-1);
  });
  it('throws on division by zero', () => {
    expect(() => mod(1, 0)).toThrow(expect.objectContaining({ code: 'E_DIVISION_BY_ZERO' }));
  });
  it('throws on what is not a number', () => {
    expect(() => mod('7', 2)).toThrow(expect.objectContaining({ code: 'E_TYPE' }));
  });
});

describe('$toNumber', () => {
  const toNumber = (value: unknown, fallback?: unknown): unknown =>
    evaluate({ $toNumber: { value: { $const: value }, ...(fallback === undefined ? {} : { fallback }) } } as never, source);

  it('answers a number as it is', () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber(-0.5)).toBe(-0.5);
  });
  it('reads text that is a number written in digits', () => {
    expect(toNumber('42')).toBe(42);
    expect(toNumber('-3.5')).toBe(-3.5);
    expect(toNumber('+7')).toBe(7);
    expect(toNumber('.5')).toBe(0.5);
    expect(toNumber('5.')).toBe(5);
    expect(toNumber(' 1e3 ')).toBe(1000);
    expect(toNumber('0038.50')).toBe(38.5);
  });
  for (const value of ['', '   ', 'abc', '12 kg', '1,234', '38,50', '0x10', 'Infinity', 'NaN', '1e999', '--1', true, false, null, [1], { n: 1 }]) {
    it(`refuses ${JSON.stringify(value)}, and answers the fallback where there is one`, () => {
      expect(() => toNumber(value)).toThrow(expect.objectContaining({ code: 'E_TYPE', message: expect.stringContaining('$toNumber') }));
      expect(toNumber(value, 0)).toBe(0);
      expect(toNumber(value, { $const: null })).toBe(null);
    });
  }
  it('the fallback is an expression, and is not evaluated when the value is a number', () => {
    expect(evaluate({ $toNumber: { value: '12', fallback: { $ref: '$.nowhere' } } }, source)).toBe(12);
    expect(evaluate({ $toNumber: { value: 'x', fallback: { $ref: '$.a' } } }, source)).toBe(source.a);
  });
  it('makes text usable by the ops that take numbers', () => {
    expect(evaluate({ $add: [{ $toNumber: { value: '4' } }, 1] }, source)).toBe(5);
  });
});

describe('the new math ops, compiled', () => {
  it('execute answers as evaluate does', async () => {
    const config = { stripe: { $mod: [{ $ref: '$.a' }, 3] }, down: { $round: { value: { $div: [{ $ref: '$.a' }, 3] }, mode: 'floor' } }, n: { $toNumber: { value: '8', fallback: 0 } } };
    expect(execute(await compile(config), source)).toEqual(evaluate(config, source));
  });
});

describe('type errors', () => {
  it('$add throws on non-numbers', () => {
    expect(() => evaluate({ $add: [{ $const: 'a' }, { $const: 1 }] }, source)).toThrow();
  });
});

describe('a math answer is a JSON number', () => {
  const codeOf = (config: object, src: object): string | undefined => {
    try {
      evaluate(config as never, src);
    } catch (error) {
      return error instanceof PrismError ? error.code : String(error);
    }
    return undefined;
  };
  it('a sum, difference, product or quotient past what a number can be is refused', () => {
    expect(codeOf({ $mul: [{ $ref: '$.a' }, 10] }, { a: 1e308 })).toBe('E_TYPE');
    expect(codeOf({ $div: [{ $ref: '$.a' }, { $ref: '$.b' }] }, { a: 1, b: 5e-324 })).toBe('E_TYPE');
    expect(codeOf({ $add: [{ $ref: '$.a' }, { $ref: '$.a' }] }, { a: 1e308 })).toBe('E_TYPE');
    expect(codeOf({ $sub: [{ $ref: '$.a' }, { $ref: '$.a' }] }, { a: -1e308 })).toBe(undefined);
    expect(codeOf({ $sub: [{ $ref: '$.a' }, 1e308] }, { a: -1e308 })).toBe('E_TYPE');
  });
  it('the refusal says which op gave what', () => {
    expect(() => evaluate({ $mul: [{ $ref: '$.a' }, 10] }, { a: 1e308 })).toThrow(/\$mul gave Infinity, which is not a JSON number/);
  });
});
