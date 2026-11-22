import { describe, it, expect } from 'vitest';
import { evaluate, evaluateSafe, compile, execute, validate, ConfigSchema, ErrorCode, PrismError } from '../src';
import { DATE_FORMATTERS, NUMBER_FORMATTERS } from '../src/ops/intl.ops';

// Intl emits non-breaking and narrow non-breaking spaces between a number and its unit.
const flat = (value: unknown): string => String(value).replace(/[  ]/g, ' ');

const source = {
  cents: 4500,
  currency: 'EUR',
  day: '2026-03-14',
  stamp: '2026-03-14T18:40:00Z',
  nothing: null,
};

describe('$localeMoney', () => {
  it('puts the symbol where the locale puts it', () => {
    const money = (locale: string): string =>
      flat(evaluate({ $localeMoney: { value: { $ref: '$.cents' }, currency: { $ref: '$.currency' }, locale } }, source));

    expect(money('de-AT')).toBe('€ 45,00');
    expect(money('de-DE')).toBe('45,00 €');
    expect(money('de-CH')).toBe('EUR 45.00');
    expect(money('en-IE')).toBe('€45.00');
  });

  it('takes the divisor from the currency, not from a hardcoded 100', () => {
    const jpy = evaluate({ $localeMoney: { value: { $ref: '$.cents' }, currency: 'JPY', locale: 'en-US' } }, source);
    expect(flat(jpy)).toBe('¥4,500');
  });

  it('honours minorUnits: false', () => {
    const whole = evaluate({ $localeMoney: { value: { $const: 45 }, currency: 'EUR', locale: 'de-DE', minorUnits: false } }, source);
    expect(flat(whole)).toBe('45,00 €');
  });

  it('respects an explicit digit count', () => {
    const rounded = evaluate({ $localeMoney: { value: { $ref: '$.cents' }, currency: 'EUR', locale: 'de-DE', digits: 0 } }, source);
    expect(flat(rounded)).toBe('45 €');
  });

  it('renders the fallback for an absent amount rather than a zero', () => {
    const absent = evaluate({ $localeMoney: { value: { $ref: '$.nothing' }, currency: 'EUR', locale: 'de-AT', fallback: '—' } }, source);
    expect(absent).toBe('—');
  });

  it('prints an unknown code beside the number instead of throwing', () => {
    const unknown = evaluate({ $localeMoney: { value: { $const: 4500 }, currency: 'XYZ', locale: 'de-AT' } }, source);
    expect(String(unknown)).toContain('XYZ');
  });

  it('refuses an amount with no currency', () => {
    expect(() => evaluate({ $localeMoney: { value: { $const: 1 }, currency: { $ref: '$.nothing' }, locale: 'de-AT' } }, source)).toThrow(PrismError);
  });

  it('prints the code beside the number for a locale Intl does not read', () => {
    expect(evaluate({ $localeMoney: { value: { $ref: '$.cents' }, currency: 'EUR', locale: 'de_AT' } }, source)).toBe('EUR 45.00');
  });
  it('takes the divisor from the currency whatever the locale, and prints its digits beside the code', () => {
    expect(evaluate({ $localeMoney: { value: 1500, currency: 'JPY', locale: { $ref: '$.locale' } } }, { locale: 'en_US' })).toBe('JPY 1500');
    expect(evaluate({ $localeMoney: { value: 1500, currency: 'KWD', locale: 'en_US' } }, {})).toBe('KWD 1.500');
    expect(evaluate({ $localeMoney: { value: 1500, currency: 'JPY', locale: 'en_US', digits: 2 } }, {})).toBe('JPY 1500.00');
  });

  it('reads the amount as $toNumber reads text, and refuses anything else', () => {
    const money = (value: unknown): unknown => evaluate({ $localeMoney: { value: { $ref: '$.v' }, currency: 'EUR', locale: 'de-DE' } }, { v: value });
    for (const value of [[1999], true, '0x10', '   ', '12 kg']) {
      const result = evaluateSafe({ $localeMoney: { value: { $ref: '$.v' }, currency: 'EUR', locale: 'de-DE' } }, { v: value });
      expect(result.ok ? 'ok' : result.error).toMatchObject({ code: ErrorCode.TYPE });
    }
    expect(flat(money(' 1999 '))).toBe('19,99 €');
    expect(flat(money('1e3'))).toBe('10,00 €');
  });
});

describe('$localeDate', () => {
  it('names weekdays and months in the locale', () => {
    const options = { weekday: 'short', day: 'numeric', month: 'short' } as const;
    const de = evaluate({ $localeDate: { value: { $ref: '$.day' }, locale: 'de-AT', options } }, source);
    const en = evaluate({ $localeDate: { value: { $ref: '$.day' }, locale: 'en-GB', options } }, source);
    expect(String(de)).toContain('Mär');
    expect(String(en)).toContain('Mar');
  });

  it('reads a DATE-only value as UTC so it cannot render as the day before', () => {
    const formatted = evaluate(
      { $localeDate: { value: { $ref: '$.day' }, locale: 'en-GB', options: { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' } } },
      source,
    );
    // An explicit zone wins: this one is the 13th.
    expect(String(formatted)).toContain('13');
    const pinned = evaluate({ $localeDate: { value: { $ref: '$.day' }, locale: 'en-GB', options: { day: 'numeric', month: 'numeric', year: 'numeric' } } }, source);
    expect(String(pinned)).toContain('14');
  });

  it('formats a timestamp with a time style', () => {
    const formatted = evaluate(
      { $localeDate: { value: { $ref: '$.stamp' }, locale: 'de-AT', options: { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' } } },
      source,
    );
    expect(String(formatted)).toContain('18:40');
  });

  it('renders the fallback for an absent date', () => {
    expect(evaluate({ $localeDate: { value: { $ref: '$.nothing' }, locale: 'de-AT', fallback: '—' } }, source)).toBe('—');
  });

  it('throws on an unparseable date', () => {
    expect(() => evaluate({ $localeDate: { value: { $const: 'not a date' }, locale: 'de-AT' } }, source)).toThrow(PrismError);
  });

  it('refuses a locale Intl does not read with a type error', () => {
    const result = evaluateSafe({ $localeDate: { value: { $ref: '$.day' }, locale: { $ref: '$.locale' } } }, { ...source, locale: 'de_AT' });
    expect(result.ok ? undefined : result.error).toMatchObject({ code: ErrorCode.TYPE, message: expect.stringContaining('"de_AT"') });
  });
});

// The fingerprint prism 0.3.3 (origin/main before a zone could be read) gives the
// written-zone config below.
const FINGERPRINT_ON_MAIN = 'd03c0f2ff80247b442e44bc9955057a1453ec5eec874f73685b533649b25ddb2';

describe('$localeDate with a zone and a locale read from the source', () => {
  const stamp = '2026-11-17T22:30:00Z';
  const options = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: { $ref: '$.zone' } };
  const config = { when: { $localeDate: { value: { $ref: '$.stamp' }, locale: { $ref: '$.locale' }, options } } };

  it('words the same instant in the zone and the locale each reader has', () => {
    const vienna = evaluate(config, { stamp, zone: 'Europe/Vienna', locale: 'de-AT' }) as { when: string };
    const angeles = evaluate(config, { stamp, zone: 'America/Los_Angeles', locale: 'en-GB' }) as { when: string };
    expect(flat(vienna.when)).toBe(flat(evaluate({ $localeDate: { value: stamp, locale: 'de-AT', options: { ...options, timeZone: 'Europe/Vienna' } } }, {})));
    expect(vienna.when).toContain('23:30');
    expect(vienna.when).toContain('Di');
    expect(angeles.when).toContain('14:30');
    expect(angeles.when).toContain('Tue');
  });

  it('a bound zone wins over the DATE-only rule, as a written one does', () => {
    const day = { $localeDate: { value: '2026-03-14', locale: 'en-GB', options: { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: { $ref: '$.zone' } } } };
    expect(String(evaluate(day, { zone: 'America/Los_Angeles' }))).toContain('13');
  });

  it('a bad date is refused before the zone is looked at, as it was', () => {
    const run = (): unknown => evaluate({ $localeDate: { value: 'not a date', locale: 'en-GB', options: { timeZone: 'Mars/Olympus' } } }, {});
    expect(run).toThrow(PrismError);
    try {
      run();
    } catch (error) {
      expect(error instanceof PrismError && error.code).toBe('E_DATE_INVALID');
    }
  });

  it('a written zone spends no step of the budget', () => {
    const fewest = (options: object): number | undefined => {
      for (let steps = 1; steps < 20; steps++) {
        try {
          evaluate({ $localeDate: { value: stamp, locale: 'en-GB', options } }, {}, { limits: { maxSteps: steps } });
          return steps;
        } catch {
          // Too few steps: try one more.
        }
      }
      return undefined;
    };
    const without = fewest({ hour: '2-digit' });
    expect(without).toBeDefined();
    expect(fewest({ hour: '2-digit', timeZone: 'Europe/Vienna' })).toBe(without);
  });

  it('refuses a zone Intl does not know, written or read, and a zone that is not text', () => {
    const at = (timeZone: unknown, source: object): unknown => evaluate({ $localeDate: { value: stamp, locale: 'en-GB', options: { timeZone } } }, source);
    for (const run of [() => at({ $ref: '$.zone' }, { zone: 'Mars/Olympus' }), () => at('Mars/Olympus', {}), () => at({ $ref: '$.zone' }, { zone: null })]) {
      expect(run).toThrow(PrismError);
      try {
        run();
      } catch (error) {
        expect(error instanceof PrismError && error.code).toBe('E_TYPE');
      }
    }
  });

  it('a config with a written zone parses and compiles to what it did', async () => {
    const written = { when: { $localeDate: { value: { $ref: '$.stamp' }, locale: 'en-GB', options: { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' } } } };
    // Compared as JSON text, keys in order: the fingerprint is the hash of exactly this text.
    expect(JSON.stringify(ConfigSchema.parse(written))).toBe(JSON.stringify(written));
    const compiled = await compile(written);
    expect(JSON.stringify(compiled.core)).toBe(JSON.stringify(written));
    // As main computes it for this config.
    expect(compiled.meta.fingerprint).toBe(FINGERPRINT_ON_MAIN);
  });

  it('a written zone that is neither text nor an op is refused as the config is read, as before', () => {
    for (const timeZone of [5, null, true, { zone: 'Europe/Vienna' }]) {
      const result = validate({ $localeDate: { value: stamp, locale: 'en-GB', options: { timeZone } } });
      expect(result.ok).toBe(false);
    }
  });

  it('a config with a bound zone compiles the same each time, and runs from a stored IR in each zone', async () => {
    const first = await compile(config);
    const again = await compile(structuredClone(config));
    expect(again.meta.fingerprint).toBe(first.meta.fingerprint);
    const stored = JSON.parse(JSON.stringify(first)) as typeof first;
    const out = execute(stored, { stamp, zone: 'Asia/Tokyo', locale: 'en-GB' }) as { when: string };
    expect(out.when).toContain('07:30');
    expect(out.when).toContain('Wed');
    expect(() => execute(stored, { stamp, zone: 'Mars/Olympus', locale: 'en-GB' })).toThrow(PrismError);
  });

  it('keeps a written zone and a bound one for the run: the words are the Intl data of the machine that runs it', async () => {
    const written = await compile({ when: { $localeDate: { value: stamp, locale: 'en-GB', options: { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' } } } });
    expect(written.meta.stats.optimizations.constantsFolded).toBe(0);
    expect(execute(written, {})).toEqual({ when: '23:30' });
    // Value and locale written, so only the bound zone keeps it from folding.
    const bound = await compile({ when: { $localeDate: { value: stamp, locale: 'en-GB', options: { hour: '2-digit', minute: '2-digit', timeZone: { $ref: '$.zone' } } } } });
    expect(bound.meta.stats.optimizations.constantsFolded).toBe(0);
    expect(bound.core).toEqual({ when: { $localeDate: { value: stamp, locale: 'en-GB', options: { hour: '2-digit', minute: '2-digit', timeZone: { $ref: '$.zone' } } } } });
    expect(execute(bound, { zone: 'Asia/Tokyo' })).toEqual({ when: '07:30' });
  });
});

describe('a locale tag Intl cannot read', () => {
  const code = (run: () => unknown): string | undefined => {
    try {
      run();
    } catch (error) {
      return error instanceof PrismError ? error.code : String(error);
    }
    return undefined;
  };

  it('is refused with E_TYPE by $localeDate and $localeNumber, written or read', () => {
    expect(code(() => evaluate({ $localeDate: { value: '2026-01-01T10:00:00Z', locale: { $ref: '$.l' } } }, { l: 'not a locale!' }))).toBe('E_TYPE');
    expect(code(() => evaluate({ $localeDate: { value: '2026-01-01T10:00:00Z', locale: 'en_GB' } }, {}))).toBe('E_TYPE');
    expect(code(() => evaluate({ $localeNumber: { value: 1, locale: { $ref: '$.l' } } }, { l: 'en_GB' }))).toBe('E_TYPE');
  });

  it('is looked at where Intl looked at it: a bad date is still E_DATE_INVALID', () => {
    expect(code(() => evaluate({ $localeDate: { value: 'not a date', locale: 'en_GB' } }, {}))).toBe('E_DATE_INVALID');
  });

  it('a tag that is well formed is read as Intl reads it, as before', () => {
    expect(evaluate({ $localeDate: { value: '2026-01-01', locale: { $ref: '$.l' } } }, { l: 'xx-YY' })).toBeTypeOf('string');
  });

  it('$localeMoney still prints the code beside the amount, as it always did', () => {
    expect(evaluate({ $localeMoney: { value: 4500, currency: 'EUR', locale: 'en_GB' } }, {})).toBe('EUR 45.00');
  });
});

describe('options Intl refuses', () => {
  const refusal = (config: object): unknown => {
    const result = evaluateSafe(config as never, {});
    return result.ok ? 'ok' : result.error;
  };

  it('are a Prism error with E_SCHEMA and the op, not a bare RangeError or TypeError', () => {
    expect(refusal({ $localeDate: { value: '2026-03-14', locale: 'de-AT', options: { dateStyle: 'medium', weekday: 'short' } } })).toMatchObject({
      code: ErrorCode.SCHEMA,
      message: expect.stringContaining('$localeDate: Intl refused its options'),
    });
    expect(refusal({ $localeNumber: { value: 3.1, locale: 'de-AT', minDigits: 2, digits: 1 } })).toMatchObject({
      code: ErrorCode.SCHEMA,
      message: expect.stringContaining('$localeNumber: Intl refused its options'),
    });
    expect(refusal({ $localeNumber: { value: 3.1, locale: 'de-AT', minDigits: 2, digits: 1 } })).toBeInstanceOf(PrismError);
  });

  it('a zone Intl does not know stays E_TYPE, as a zone was refused before', () => {
    expect(refusal({ $localeDate: { value: '2026-03-14', locale: 'de-AT', options: { timeZone: 'Europe/Wien' } } })).toMatchObject({ code: ErrorCode.TYPE });
  });
});

describe('$localeNumber', () => {
  it('uses the locale decimal mark and grouping', () => {
    const number = (locale: string): string => flat(evaluate({ $localeNumber: { value: { $const: 1234.5 }, locale, minDigits: 1 } }, source));
    expect(number('de-AT')).toBe('1 234,5');
    expect(number('de-DE')).toBe('1.234,5');
    expect(number('en-GB')).toBe('1,234.5');
  });

  it('formats a percent from a fraction', () => {
    expect(flat(evaluate({ $localeNumber: { value: { $const: 0.42 }, locale: 'en-GB', style: 'percent' } }, source))).toBe('42%');
  });

  it('compacts when asked', () => {
    expect(flat(evaluate({ $localeNumber: { value: { $const: 1200 }, locale: 'en-GB', compact: true } }, source))).toBe('1.2k');
  });

  it('refuses an amount that is not a number or numeric text', () => {
    for (const value of [[1999], true, '0x10', '   ']) {
      const result = evaluateSafe({ $localeNumber: { value: { $ref: '$.v' }, locale: 'en-GB' } }, { v: value });
      expect(result.ok ? 'ok' : result.error).toMatchObject({ code: ErrorCode.TYPE });
    }
    expect(evaluate({ $localeNumber: { value: { $ref: '$.v' }, locale: 'en-GB' } }, { v: ' 1234 ' })).toBe('1,234');
  });

  it('refuses a locale Intl does not read with a type error', () => {
    const result = evaluateSafe({ $localeNumber: { value: { $const: 1 }, locale: { $ref: '$.locale' } } }, { ...source, locale: 'de_AT' });
    expect(result.ok ? undefined : result.error).toMatchObject({ code: ErrorCode.TYPE, message: expect.stringContaining('"de_AT"') });
  });
});

describe('compiled path', () => {
  it('runs the ops through the optimizer as well as the interpreter', async () => {
    const ir = await compile({
      price: { $localeMoney: { value: { $ref: '$.cents' }, currency: { $ref: '$.currency' }, locale: 'de-AT' } },
      when: { $localeDate: { value: { $ref: '$.day' }, locale: 'de-AT', options: { day: 'numeric', month: 'long' } } },
    });
    const out = execute(ir, source) as { price: string; when: string };
    expect(flat(out.price)).toBe('€ 45,00');
    expect(out.when).toContain('März');
  });
});

describe('the formatter caches', () => {
  it('keep at most 1,000 formatters each, however many locales the data names', () => {
    const config = {
      date: { $localeDate: { value: { $ref: '$.day' }, locale: { $ref: '$.locale' } } },
      money: { $localeMoney: { value: { $ref: '$.cents' }, currency: 'EUR', locale: { $ref: '$.locale' } } },
      number: { $localeNumber: { value: { $ref: '$.cents' }, locale: { $ref: '$.locale' } } },
    };
    for (let i = 0; i < 5000; i++) evaluate(config, { ...source, locale: `en-x-${i.toString(36)}` });
    expect(DATE_FORMATTERS.size).toBeLessThanOrEqual(1000);
    expect(NUMBER_FORMATTERS.size).toBeLessThanOrEqual(1000);
    const out = evaluate(config, { ...source, locale: 'de-AT' }) as { date: string; money: string; number: string };
    expect([out.date, flat(out.money), flat(out.number)]).toEqual(['14.03.2026', '€ 45,00', '4 500']);
  });
});
