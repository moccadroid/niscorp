import { z } from 'zod';
import { HtmlSelectedItemSchema } from '../operations/web.js';
import { HtmlFieldsSchema } from '../readers/html/index.js';

const referenceValues = z.array(z.string().nullable());
const failure = z.object({ code: z.string(), message: z.string() }).strict();
const group = {
  kind: z.enum(['attributes', 'fields']),
  name: z.string(),
};

export const ResolvedReferenceValuesSchema = z
  .object({
    ...group,
    values: referenceValues,
    errors: z.array(failure.nullable()),
  })
  .strict();

export const ResolveReferenceValuesInputSchema = z
  .object({
    ...group,
    values: referenceValues,
    base: z.string(),
    encoding: z.string(),
  })
  .strict();

export const HtmlReferenceRecordSchema = HtmlSelectedItemSchema.extend({
  references: z
    .object({
      attributes: z.record(z.string(), z.string().nullable()),
      fields: z.record(z.string(), referenceValues),
    })
    .strict(),
  referenceErrors: z.array(
    z
      .object({
        ...group,
        errors: z.array(failure.nullable()),
      })
      .strict(),
  ),
});

export const HtmlReferencesInputSchema = z
  .object({
    record: HtmlSelectedItemSchema,
    fields: HtmlFieldsSchema.nullable(),
    urlAttributes: z.array(z.string()),
    base: z.string(),
    encoding: z.string(),
  })
  .strict();
