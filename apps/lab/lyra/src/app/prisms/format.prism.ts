// These helpers are for vex entry mappings, where the scope root exists.
// Anywhere else the locale resolves to nothing and `$localeDate` and
// `$localeMoney` throw.
const LOCALE = { $ref: '$.scope.locale' };
const CURRENCY = { $ref: '$.scope.currency' };

const NONE = '—';

export const dateText = (value: unknown) => ({
  $localeDate: { value, locale: LOCALE, options: { weekday: 'short', day: 'numeric', month: 'short' }, fallback: NONE },
});

export const dayText = (value: unknown) => ({
  $localeDate: { value, locale: LOCALE, options: { weekday: 'short', day: 'numeric' }, fallback: NONE },
});

export const stampText = (value: unknown) => ({
  $localeDate: { value, locale: LOCALE, options: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, fallback: NONE },
});

// The currency is a required argument: with a default, a call site that forgot
// it would render a plausible amount in the wrong currency.
const amount = (cents: unknown, currency: unknown, digits: number) => ({
  $localeMoney: {
    value: cents,
    currency,
    locale: LOCALE,
    digits,
    // Runs when there is no row (a SUM over no rows is NULL), so the zero
    // reads its currency from scope: the row cannot name one, and
    // `$localeMoney` throws without an ISO-4217 code.
    fallback: { $localeMoney: { value: 0, currency: CURRENCY, locale: LOCALE, digits, minorUnits: false } },
  },
});

export const money = (cents: unknown, currency: unknown) => amount(cents, currency, 0);

export const priceText = (cents: unknown, currency: unknown) => amount(cents, currency, 2);

export const countText = (value: unknown) => ({
  $localeNumber: { value, locale: LOCALE, digits: 0, fallback: '0' },
});

export const timeText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: value }],
    else: NONE,
  },
});

// The phrase is translated whole and the renderer fills its slots. A pattern
// must land on a prose key (`*_display`, `sentence`): at any other key the
// renderer leaves the object as it is.
export const pattern = (phrase: string, slots: Record<string, unknown>) => ({ phrase, slots });

export const fillText = (booked: unknown, capacity: unknown) =>
  pattern('{n} of {total}', { n: { $coalesce: [booked, 0] }, total: { $coalesce: [capacity, 0] } });

export const fillTone = (booked: unknown, capacity: unknown) => ({
  $case: {
    branches: [
      { when: { $gte: [{ $coalesce: [booked, 0] }, { $coalesce: [capacity, 1] }] }, then: 'warm' },
      { when: { $eq: [{ $coalesce: [booked, 0] }, 0] }, then: 'neutral' },
    ],
    else: 'good',
  },
});

const periodWords = (unit: unknown, count: unknown, single: Record<string, string>, many: Record<string, string>) => {
  const isUnit = (name: string) => ({ $eq: [unit, name] });
  const once = { $or: [{ $eq: [count, 1] }, { $not: count }] };
  const branch = (name: string) => ({
    when: isUnit(name),
    then: {
      $case: {
        branches: [{ when: once, then: single[name] ?? '' }],
        else: pattern(many[name] ?? '', { n: count }),
      },
    },
  });
  return {
    $case: {
      branches: [branch('day'), branch('week'), branch('year')],
      else: {
        $case: {
          branches: [{ when: once, then: single['month'] ?? '' }],
          else: pattern(many['month'] ?? '', { n: count }),
        },
      },
    },
  };
};

export const intervalText = (unit: unknown, count: unknown) =>
  periodWords(
    unit,
    count,
    { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' },
    { day: 'Every {n} days', week: 'Every {n} weeks', month: 'Every {n} months', year: 'Every {n} years' },
  );

export const perIntervalText = (unit: unknown, count: unknown) =>
  periodWords(
    unit,
    count,
    { day: 'a day', week: 'a week', month: 'a month', year: 'a year' },
    { day: 'every {n} days', week: 'every {n} weeks', month: 'every {n} months', year: 'every {n} years' },
  );

export const sessionStateText = (status: unknown, time: unknown) => ({
  $case: {
    branches: [{ when: { $eq: [status, 'cancelled'] }, then: 'Cancelled' }],
    else: time,
  },
});
