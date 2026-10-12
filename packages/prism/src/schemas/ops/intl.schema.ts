import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

const localeField = z
  .lazy(node)
  .describe('BCP-47 locale tag ("de-AT", "en-GB"). Required — a default renders plausible nonsense for everybody it is wrong for.');

const fallbackField = z
  .lazy(node)
  .optional()
  .describe('Rendered when the value is null/undefined/empty. Default: "".');

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
