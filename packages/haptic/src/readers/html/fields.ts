import type { Element } from 'domhandler';
import { z } from 'zod';
import { RunControl } from '../../engine/control.js';
import { compileClosestLocator, validateLocator } from './locator.js';
import type { HtmlStructure } from './structure.js';

export const HtmlFieldRuleSchema = z
  .object({
    selector: z
      .string()
      .min(1)
      .describe(
        'CSS over the field scope and its descendants only, in document order. The scope is this record unless closest is supplied. :scope selects the scope itself.',
      ),
    closest: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional CSS selecting the nearest matching element at or above this record in the original document. That element becomes the field scope. No match yields []; do not fall back to a farther ancestor when selector has no matches. Omit to keep the record scope.',
      ),
    attribute: z
      .string()
      .min(1)
      .nullable()
      .describe(
        'Null reads native text; a name reads that exact parsed HTML attribute, not a JavaScript property name. Missing attributes produce null, not invented text.',
      ),
    minimum: z
      .number()
      .int()
      .nonnegative()
      .describe(
        'Inclusive minimum selected elements per record. Zero permits no matches. This counts elements, not non-null or nonempty values.',
      ),
    maximum: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe('Inclusive maximum selected elements per record; null is unbounded.'),
  })
  .strict();

export const HtmlFieldsSchema = z
  .preprocess(
    (input, context) => {
      if (input !== null && typeof input === 'object' && Object.hasOwn(input, '__proto__')) {
        context.addIssue({
          code: 'custom',
          message: '__proto__ is not supported as an HTML field key',
        });
        return z.NEVER;
      }
      return input;
    },
    z.record(
      z
        .string()
        .min(1)
        .regex(/^(?!__proto__$)/),
      HtmlFieldRuleSchema,
    ),
  )
  .describe(
    'Arbitrary field names mapped to CSS/read/bounds rules for each record, with optional enclosing scope through closest. Values remain arrays. The reserved __proto__ field key is unsupported.',
  );
export type HtmlFields = z.infer<typeof HtmlFieldsSchema>;
export type HtmlFieldValues = Record<string, (string | null)[]>;

export class HtmlFieldError extends Error {
  constructor(
    readonly field: string,
    readonly selector: string,
    readonly minimum: number,
    readonly maximum: number | null,
    readonly actual: number | null,
    readonly recordIndex?: number,
    readonly closest?: string,
  ) {
    super(
      'HTML_FIELD_MATCHES: ' +
        JSON.stringify({ field, selector, minimum, maximum, actual, recordIndex, closest }),
    );
  }
}

export const readHtmlFields = (
  structure: HtmlStructure,
  records: readonly Element[],
  rules: HtmlFields,
  limits: { maxValues: number; maxBytes: number },
  signal: AbortSignal,
): HtmlFieldValues[] => {
  for (const [name, rule] of Object.entries(rules)) {
    signal.throwIfAborted();
    validateLocator(rule.selector);
    if (rule.closest !== undefined) compileClosestLocator(rule.closest);
    if (rule.maximum !== null && rule.maximum < rule.minimum)
      throw new HtmlFieldError(
        name,
        rule.selector,
        rule.minimum,
        rule.maximum,
        null,
        undefined,
        rule.closest,
      );
  }
  let values = 0;
  let bytes = 0;
  const consumeBytes = (value: string): void => {
    bytes += Buffer.byteLength(value);
    if (bytes > limits.maxBytes)
      throw new RunControl('HTML_FIELD_BYTES', 'HTML field-byte allowance exceeded');
  };
  return records.map((record, recordIndex) =>
    Object.fromEntries(
      Object.entries(rules).map(([name, rule]) => {
        signal.throwIfAborted();
        consumeBytes(name);
        const scope = rule.closest === undefined ? record : structure.closest(rule.closest, record);
        const matches = scope === null ? [] : structure.queryWithin(rule.selector, scope);
        values += matches.length;
        if (values > limits.maxValues)
          throw new RunControl('HTML_FIELD_VALUES', 'HTML field-value allowance exceeded');
        if (
          matches.length < rule.minimum ||
          (rule.maximum !== null && matches.length > rule.maximum)
        )
          throw new HtmlFieldError(
            name,
            rule.selector,
            rule.minimum,
            rule.maximum,
            matches.length,
            recordIndex,
            rule.closest,
          );
        return [
          name,
          matches.map((node) => {
            const value =
              rule.attribute === null
                ? structure.textOf(node)
                : (node.attribs[rule.attribute] ?? null);
            if (value !== null) consumeBytes(value);
            return value;
          }),
        ];
      }),
    ),
  );
};
