import { describe, it, expect } from 'vitest';
import { evaluate, compile, execute, validate, ConfigSchema, PrismError } from '../src';

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
});

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
    expect(fewest({ hour: '2-digit', timeZone: 'Europe/Vienna' })).toBe(fewest({ hour: '2-digit' }));
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
    expect(ConfigSchema.parse(written)).toEqual(written);
    // The core is the config as written, so its fingerprint is the one it had.
    expect((await compile(written)).core).toEqual(written);
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

  it('folds a written zone as before, and keeps a bound one for the run', async () => {
    const written = await compile({ when: { $localeDate: { value: stamp, locale: 'en-GB', options: { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' } } } });
    expect(written.core).toEqual({ when: { $const: '23:30' } });
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
