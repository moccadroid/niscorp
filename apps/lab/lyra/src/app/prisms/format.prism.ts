// ═══════════════════════════════════════════════════════════════
// HOW THIS STUDIO'S NUMBERS AND DATES READ.
//
// Every helper here compiles to a prism node that reads `{ $ref: '$.scope.locale' }`
// — the studio's language, injected engine-side per session (app.ts `scope`)
// and unauthorable by a request. That makes these helpers **for vex entry
// mappings**, which is where the scope root exists. Used anywhere else the
// locale resolves to nothing and `$localeDate`/`$localeMoney` throw by design;
// they refuse rather than guess, so a misplaced call is loud at the first read
// instead of quietly American.
//
// The formatting itself is `Intl`, not a table in this file. What used to live
// here was a `SYMBOL` map and dayjs tokens, which produced `€45` and
// `Fri 14 Mar` for every studio in every country. Both were wrong for the
// Austrian studio this app was seeded with, and no amount of care with a
// symbol table fixes it: one currency and one language still disagree across
// three countries about where the glyph goes.
//
// The closed-set WORDS a read manufactures ("Active", "Cancelled") are NOT
// translated here. They stay English at source and are swapped on the way out
// by the render-tree pass, which is why they land on `*_display` fields —
// app.ts declares that suffix as the app's display-field convention.
// ═══════════════════════════════════════════════════════════════

/** The studio's language, as every helper below reads it. */
const LOCALE = { $ref: '$.scope.locale' };
/** The studio's own money, for amounts that belong to no row — see `amount`. */
const CURRENCY = { $ref: '$.scope.currency' };

/** Absent renders as an em dash, never as a zero and never as a crash. */
const NONE = '—';

/** A date the way a timetable writes one: "Fri 14 Mar", "Fr., 14. März". */
export const dateText = (value: unknown) => ({
  $localeDate: { value, locale: LOCALE, options: { weekday: 'short', day: 'numeric', month: 'short' }, fallback: NONE },
});

/** Just the weekday and day: "Fri 14". For a column that already says the month. */
export const dayText = (value: unknown) => ({
  $localeDate: { value, locale: LOCALE, options: { weekday: 'short', day: 'numeric' }, fallback: NONE },
});

/** A timestamp for a feed: "14 Mar, 18:40". */
export const stampText = (value: unknown) => ({
  $localeDate: { value, locale: LOCALE, options: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, fallback: NONE },
});

// THE CURRENCY IS AN ARGUMENT, not a constant.
//
// Every table holding money names its currency (schema.ts) and every read that
// renders money selects it. Required, not optional: a default here would be the
// same bug with a longer fuse — the call site that forgot would still render
// something plausible, and the only way to find out would be a studio in Zürich
// reading euros. The signature refuses instead, and the compiler names every site.
//
// What is no longer this file's business is the GLYPH and where it goes. That
// is the currency's and the locale's joint answer, and `$localeMoney` asks them.
const amount = (cents: unknown, currency: unknown, digits: number) => ({
  $localeMoney: {
    value: cents,
    currency,
    locale: LOCALE,
    digits,
    // A SUM over no rows is NULL and a studio with nothing sold yet is an
    // ordinary Tuesday — it shows a zero IN ITS OWN CURRENCY, not a dash,
    // because "nothing earned" is a number and "no date" is not.
    //
    // THE ZERO READS ITS CURRENCY FROM SCOPE, NOT FROM THE ROW. This fallback
    // runs precisely when there is no row — so asking the row for its currency
    // asked the absent thing to describe itself, and `$localeMoney` threw for
    // want of an ISO-4217 code. Every read shaped as ONE object over zero rows
    // answered 500: a prospect's own membership card, a member's the day their
    // subscription ended, the revenue tiles of a studio that had sold nothing.
    // The studio's currency is a property of the STUDIO, so it is on the
    // assertion beside `locale` (app.ts) and available whether or not anything
    // matched.
    fallback: { $localeMoney: { value: 0, currency: CURRENCY, locale: LOCALE, digits, minorUnits: false } },
  },
});

export const money = (cents: unknown, currency: unknown) => amount(cents, currency, 0);

/** Money with cents, for a price list where 89.50 matters. */
export const priceText = (cents: unknown, currency: unknown) => amount(cents, currency, 2);

/** A whole number the way this locale groups them — 1.234 / 1 234 / 1,234. */
export const countText = (value: unknown) => ({
  $localeNumber: { value, locale: LOCALE, digits: 0, fallback: '0' },
});

/** A class time from the stored "18:30". Already a string; this is where a
 *  12-hour studio would diverge — and the reason it has not yet is that no
 *  seeded locale wants one. */
export const timeText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: value }],
    else: NONE,
  },
});

// ── counted phrases: patterns, translated whole ──────────────
//
// "12 of 20" carries two numbers, so its cardinality is unbounded and no
// book can hold the sentence. What a book CAN hold is the PATTERN: '{n} of
// {total}' is one row, translated whole, and the holes are filled in the
// reader's language by the renderer — in EVERY language, the source one
// included, so no component ever meets the raw shape. A string slot is offered
// to the book too, so a composed sentence's fragments translate with their
// frame. A pattern must land on a prose key (`*_display`, `sentence`); at any
// other key the renderer leaves it alone, deliberately.
//
// This replaced a per-word `byLanguage` table that taught ONE mapping the
// difference between 'of' and 'von' — the two-entry table the old comment
// here warned would grow.
export const pattern = (phrase: string, slots: Record<string, unknown>) => ({ phrase, slots });

/** "12 of 20" — a fill figure a person can read at a glance. */
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

// ── HOW OFTEN SOMETHING IS BILLED ────────────────────────────
//
// An offering's period is a PAIR — a unit and a count — because a studio may
// bill quarterly, fortnightly or every ten weeks, and the two columns that were
// there before ('month' | 'year') held our guess about somebody else's
// business rather than a limit anything imposed.
//
// A pair does not render itself, and two reads spell it: the price list a desk
// edits and the plan list a member chooses from. They said 'Monthly' and
// 'a month' respectively — different registers for the same fact, which is
// right — so both live here and neither screen invents a third wording.
//
// COUNT OF ONE GETS ITS OWN WORD, in both. "Every 1 month" is not something a
// person writes, and a price list full of it reads as a machine's output. So
// four fixed words at n = 1, and a counted pattern beyond it — the pattern
// being the only shape a book can hold for an unbounded number (see `pattern`
// above).
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
      // Month is the else rather than a fourth branch: it is the column's
      // default, so it is also what an unreadable value falls back to.
      else: {
        $case: {
          branches: [{ when: once, then: single['month'] ?? '' }],
          else: pattern(many['month'] ?? '', { n: count }),
        },
      },
    },
  };
};

/** The desk's register, for a price-list column: "Monthly", "Every 3 months". */
export const intervalText = (unit: unknown, count: unknown) =>
  periodWords(
    unit,
    count,
    { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' },
    { day: 'Every {n} days', week: 'Every {n} weeks', month: 'Every {n} months', year: 'Every {n} years' },
  );

/** The member's register, which reads after a price: "€89 a month",
 *  "€240 every 3 months". */
export const perIntervalText = (unit: unknown, count: unknown) =>
  periodWords(
    unit,
    count,
    { day: 'a day', week: 'a week', month: 'a month', year: 'a year' },
    { day: 'every {n} days', week: 'every {n} weeks', month: 'every {n} months', year: 'every {n} years' },
  );

/** A cancelled session says so; everything else says when it starts. A fixed
 *  word against an open-ended one — so 'Cancelled' stays English here and the
 *  render pass swaps it, exactly like every other closed-set display word. */
export const sessionStateText = (status: unknown, time: unknown) => ({
  $case: {
    branches: [{ when: { $eq: [status, 'cancelled'] }, then: 'Cancelled' }],
    else: time,
  },
});
