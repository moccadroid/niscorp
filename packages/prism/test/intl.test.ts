import { describe, it, expect } from 'vitest';
import { evaluate, compile, execute, PrismError } from '../src';

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
