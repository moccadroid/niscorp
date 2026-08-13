import { describe, it, expect } from 'vitest';
import { evaluate, compile, execute, PrismError } from '../src';

// Non-breaking and narrow-non-breaking spaces are what Intl actually emits
// between a number and its unit. Comparing against a plain space is how a test
// like this passes on one Node build and fails on the next.
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

    // THE WHOLE ARGUMENT FOR THIS OP, in four lines. Not "English versus
    // German" — three GERMAN locales disagree with each other about where the
    // symbol goes, what separates the decimals, and whether a glyph is used at
    // all. Any hand-written symbol table gets at least two of these wrong, and
    // `€45` (what lyra shipped) is wrong for all three.
    expect(money('de-AT')).toBe('€ 45,00');
    expect(money('de-DE')).toBe('45,00 €');
    expect(money('de-CH')).toBe('EUR 45.00');
    expect(money('en-IE')).toBe('€45.00');
  });

  it('takes the divisor from the currency, not from a hardcoded 100', () => {
    // JPY has no minor unit — 4500 yen is ¥4,500, not ¥45.
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
    // The classic off-by-one: '2026-03-14' is UTC midnight, and formatting that
    // in any zone west of Greenwich without pinning the zone prints the 13th.
    const formatted = evaluate(
      { $localeDate: { value: { $ref: '$.day' }, locale: 'en-GB', options: { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' } } },
      source,
    );
    // Explicit zone wins — this one IS the 13th, which proves the default is a
    // default and not a hardcode.
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
    // Austria groups with a narrow no-break space where Germany uses a full
    // stop — the same disagreement the money case shows, on a bare number.
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
    // The optimizer attaches a handler per op and skips the discriminant chain.
    // An op wired into `evaluate` but not into `optimize` passes every test
    // above and then fails the moment a vex mapping (which is always compiled)
    // replays it — so the compiled path gets its own case.
    const ir = await compile({
      price: { $localeMoney: { value: { $ref: '$.cents' }, currency: { $ref: '$.currency' }, locale: 'de-AT' } },
      when: { $localeDate: { value: { $ref: '$.day' }, locale: 'de-AT', options: { day: 'numeric', month: 'long' } } },
    });
    const out = execute(ir, source) as { price: string; when: string };
    expect(flat(out.price)).toBe('€ 45,00');
    expect(out.when).toContain('März');
  });
});
