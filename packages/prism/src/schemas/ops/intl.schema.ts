import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

// ═══════════════════════════════════════════════════════════
// THE LOCALE-AWARE FORMATTING FAMILY.
//
// `$date` (time.schema) formats with dayjs tokens and is locale-BLIND: the
// token `MMM` is "Mar" in every language it will ever run in. That is correct
// for a machine-readable stamp and wrong for anything a person reads, so the
// three ops here exist beside it rather than inside it — the choice between
// them is "who is reading this", and a caller should have to answer it.
//
// All three delegate to `Intl`, which the platform already ships. That is the
// whole reason the family is small: symbol placement (`€45` vs `45 €`), the
// decimal mark, weekday and month names, and the digit grouping are not
// three ops' worth of rules, they are one runtime's worth of CLDR data.
//
// `locale` is REQUIRED on every one of them. A default here would be the same
// bug `format.prism.ts` documents about its currency symbol: the call site
// that forgot still renders something plausible, and the only way to find out
// is a reader in Vienna being shown American dates.
// ═══════════════════════════════════════════════════════════

const localeField = z
  .lazy(node)
  .describe('BCP-47 locale tag ("de-AT", "en-GB"). Required — a default renders plausible nonsense for everybody it is wrong for.');

const fallbackField = z
  .lazy(node)
  .optional()
  .describe('Rendered when the value is null/undefined/empty. Default: "".');

// The subset of Intl.DateTimeFormatOptions worth exposing declaratively. A
// passthrough `z.record(z.unknown())` would let a typo ride silently into a
// formatter that ignores unknown keys — every field a screen actually asks
// for is named here instead, and anything else is a schema error at author
// time rather than a missing weekday at read time.
const DateStyle = z.enum(['full', 'long', 'medium', 'short']);

export const IntlDateOptionsSchema = z
  .object({
    dateStyle: DateStyle.optional().describe('Whole-date preset. Mutually exclusive with the field-by-field options below.'),
    timeStyle: DateStyle.optional().describe('Whole-time preset. Mutually exclusive with the field-by-field options below.'),
    weekday: z.enum(['long', 'short', 'narrow']).optional(),
    year: z.enum(['numeric', '2-digit']).optional(),
    month: z.enum(['numeric', '2-digit', 'long', 'short', 'narrow']).optional(),
    day: z.enum(['numeric', '2-digit']).optional(),
    hour: z.enum(['numeric', '2-digit']).optional(),
    minute: z.enum(['numeric', '2-digit']).optional(),
    second: z.enum(['numeric', '2-digit']).optional(),
    hour12: z.boolean().optional().describe('Force 12/24-hour. Omit to take the locale\'s own convention — which is the point of asking for a locale.'),
    timeZone: z
      .string()
      .optional()
      .describe('IANA zone. Omit and a DATE-only value ("2026-03-14") is read as UTC, which is what stops it rendering as the 13th west of Greenwich.'),
  })
  .strict();

export type IntlDateOptions = z.infer<typeof IntlDateOptionsSchema>;

export const LocaleDateNodeSchema = z
  .object({
    $localeDate: z
      .object({
        value: z.lazy(node).describe('ISO string, DATE-only string, or epoch milliseconds.'),
        locale: localeField,
        options: IntlDateOptionsSchema.optional().describe('Defaults to { dateStyle: "medium" }.'),
        fallback: fallbackField,
      })
      .strict(),
  })
  .strict()
  .describe('Format a date for a human reading in a given locale (Intl.DateTimeFormat).');
export type LocaleDateNode = z.infer<typeof LocaleDateNodeSchema>;

export const LocaleMoneyNodeSchema = z
  .object({
    $localeMoney: z
      .object({
        value: z.lazy(node).describe('The amount. Minor units (cents) unless `minorUnits` is false.'),
        currency: z.lazy(node).describe('ISO-4217 code — "EUR", "CHF". Required: an amount without one is a number, not money.'),
        locale: localeField,
        minorUnits: z
          .boolean()
          .optional()
          .describe(
            'Value is in the currency\'s minor unit. Default true. The divisor comes from the CURRENCY, not a hardcoded 100 — JPY has no minor unit and dividing it would be a hundredfold error.',
          ),
        digits: z.number().int().min(0).max(20).optional().describe('Fraction digits. Default: the currency\'s own (2 for EUR, 0 for JPY).'),
        fallback: fallbackField,
      })
      .strict(),
  })
  .strict()
  .describe('Format an amount as money in a given locale (Intl.NumberFormat, style currency).');
export type LocaleMoneyNode = z.infer<typeof LocaleMoneyNodeSchema>;

export const LocaleNumberNodeSchema = z
  .object({
    $localeNumber: z
      .object({
        value: z.lazy(node).describe('The number to format.'),
        locale: localeField,
        style: z.enum(['decimal', 'percent']).optional().describe('Default "decimal". "percent" multiplies by 100 — pass 0.42, not 42.'),
        digits: z.number().int().min(0).max(20).optional().describe('Maximum fraction digits. Default: the locale\'s own.'),
        minDigits: z.number().int().min(0).max(20).optional().describe('Minimum fraction digits — for a column that should not ragged-edge.'),
        compact: z.boolean().optional().describe('Short form — "1.2K", "1,2 Tsd.". For a headline figure, never for money owed.'),
        fallback: fallbackField,
      })
      .strict(),
  })
  .strict()
  .describe('Format a number in a given locale (Intl.NumberFormat).');
export type LocaleNumberNode = z.infer<typeof LocaleNumberNodeSchema>;
