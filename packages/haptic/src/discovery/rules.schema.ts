import { z } from 'zod';
import { XmlSelectionSchema } from '../operations/xml.js';
import { HtmlFieldsSchema } from '../readers/html/index.js';
import { ResultSchema, ResultFlowSchema } from './result.schema.js';

export const HtmlSelectionRulesSchema = z
  .object({
    preconditions: z
      .array(
        z
          .object({
            selector: z
              .string()
              .min(1)
              .describe(
                'CSS identifying page context checked before result and navigation selection.',
              ),
            minimum: z.number().int().nonnegative().describe('Inclusive minimum context matches.'),
            maximum: z
              .number()
              .int()
              .nonnegative()
              .nullable()
              .describe(
                'Inclusive maximum context matches; null means unbounded. Must be at least minimum.',
              ),
          })
          .strict(),
      )
      .describe(
        'Context selector/count checks applied to every supplied page before result and navigation selection. An empty array adds no context checks.',
      ),
    selector: z
      .string()
      .min(1)
      .nullable()
      .describe(
        'CSS selecting current-page result elements, or null for no result selection. Selecting an anchor returns its data; result controls resource fetching.',
      ),
    links: z
      .string()
      .min(1)
      .nullable()
      .describe(
        'CSS selecting link elements for next-stage document acquisition, or null for no onward navigation. Independent from current-page result selection.',
      ),
    fields: HtmlFieldsSchema.nullable()
      .optional()
      .describe(
        'Optional structured fields with arbitrary names for each selected result record, with optional enclosing scope through closest. Null or omission returns ordinary native elements. Requires a non-null result selector.',
      ),
  })
  .strict();

export const HtmlAuthorOutputSchema = HtmlSelectionRulesSchema.extend({ result: ResultSchema });
const stageReference = z.discriminatedUnion('format', [
  z
    .object({
      id: z.string().min(1),
      format: z.literal('json'),
      xml: z.null(),
      mapping: z.json().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      format: z.literal('xml'),
      xml: XmlSelectionSchema,
      mapping: z.json().optional(),
    })
    .strict(),
]);
export const StageRuleSchema = HtmlAuthorOutputSchema.extend({
  reference: stageReference.nullable().optional(),
});

export const TaskDeclarationSchema = z
  .object({
    requiresNavigation: z
      .boolean()
      .describe(
        'Whether TASK requests additional document acquisition beyond this starting document.',
      ),
    resultFlow: ResultFlowSchema.nullable().describe(
      'Declared result-processing flow reference, or null for selected page data and references only.',
    ),
  })
  .strict();
