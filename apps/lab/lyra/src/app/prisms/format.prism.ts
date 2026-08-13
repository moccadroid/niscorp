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
    fallback: { $localeMoney: { value: 0, currency, locale: LOCALE, digits, minorUnits: false } },
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

// ── the handful of strings that are FORMATTED rather than fixed ──
//
// "12 of 20" carries two numbers, so its cardinality is unbounded and the
// render-tree pass can never hold it in a dictionary. It has to be assembled
// in the reader's language at the point of assembly, which is here.
//
// This is a two-entry table, not an i18n system, and it should stay that way:
// every new entry is a sign that a string wants to be a fixed phrase with the
// numbers beside it rather than baked in.
const byLanguage = (table: Record<string, string>, fallback: string) => ({
  $case: {
    branches: Object.entries(table).map(([prefix, word]) => ({
      when: { $startsWith: { value: LOCALE, prefix } },
      then: word,
    })),
    else: fallback,
  },
});

/** "12 of 20" — a fill figure a person can read at a glance. */
export const fillText = (booked: unknown, capacity: unknown) => ({
  $join: {
    parts: [{ $coalesce: [booked, 0] }, ' ', byLanguage({ de: 'von' }, 'of'), ' ', { $coalesce: [capacity, 0] }],
    sep: '',
  },
});

export const fillTone = (booked: unknown, capacity: unknown) => ({
  $case: {
    branches: [
      { when: { $gte: [{ $coalesce: [booked, 0] }, { $coalesce: [capacity, 1] }] }, then: 'warm' },
      { when: { $eq: [{ $coalesce: [booked, 0] }, 0] }, then: 'neutral' },
    ],
    else: 'good',
  },
});

/** A cancelled session says so; everything else says when it starts. A fixed
 *  word against an open-ended one — so 'Cancelled' stays English here and the
 *  render pass swaps it, exactly like every other closed-set display word. */
export const sessionStateText = (status: unknown, time: unknown) => ({
  $case: {
    branches: [{ when: { $eq: [status, 'cancelled'] }, then: 'Cancelled' }],
    else: time,
  },
});
