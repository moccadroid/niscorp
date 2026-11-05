import { z } from 'zod';
import { ModelResultSchema } from './model-result.schema.js';
import type { Operation, Operations } from '../engine/contracts.js';
import { defineOperation } from '../engine/operation.js';
import { HtmlFieldsSchema } from '../readers/html/index.js';
import { XmlSelectionSchema } from '../operations/xml.js';
import { HtmlAuthorOutputSchema } from './rules.schema.js';
import { ResultSchema } from './result.schema.js';
import { createPrismMappingOperation } from './prism-mapping.js';
import {
  DiscoveryModelInputSchema,
  runDiscoveryModel,
  type ModelOperationOptions,
} from './model.js';

const sourceIndex = z.number().int().nonnegative();
export const HtmlSourceFieldsSchema = z
  .record(
    HtmlFieldsSchema.out.keyType,
    HtmlFieldsSchema.out.valueType.omit({ minimum: true, maximum: true }),
  )
  .describe(
    'Dynamic field names and read selectors. Values are arrays; unavailable matches remain empty arrays and missing attributes remain null. Match bounds are supplied by the host.',
  );
export const HtmlSourceCandidateSchema = HtmlAuthorOutputSchema.omit({
  preconditions: true,
  result: true,
}).extend({
  fields: HtmlSourceFieldsSchema.nullable().optional(),
  result: z
    .object({ reference: ResultSchema.unwrap().shape.input.shape.reference })
    .strict()
    .nullable()
    .describe(
      'Resource URL path for the task-declared processor, or null when none is declared. The task alone owns the processing flow.',
    ),
});
export const SourceWindowSchema = z
  .object({
    offset: sourceIndex.describe('Zero-based matched-element or array-entry offset.'),
    limit: z.number().int().positive().describe('Maximum matched elements displayed.'),
  })
  .strict();

const htmlQuery = z
  .object({
    selector: z.string().min(1).describe('CSS selecting elements from prepared HTML.'),
    fields: HtmlSourceFieldsSchema.nullable().optional(),
  })
  .strict();
const sourceInspectionSchema = <Query extends z.ZodType>(query: Query) =>
  z
    .object({
      action: z.literal('inspect'),
      source: sourceIndex.describe('An offered owned source index; never a URL.'),
      query,
      window: SourceWindowSchema.describe('Required display range; does not limit extraction.'),
    })
    .strict();

export const HtmlSourceInspectionSchema = sourceInspectionSchema(htmlQuery);
export const XmlSourceInspectionSchema = sourceInspectionSchema(XmlSelectionSchema);

/** A source call can inspect its source format or propose its offered component. */
export const sourceAuthorSchema = <Candidate extends z.ZodType, Inspection extends z.ZodType>(
  candidate: Candidate,
  inspection: Inspection,
): z.ZodUnion<
  readonly [
    Inspection,
    z.ZodObject<{ action: z.ZodLiteral<'propose'>; candidate: Candidate }, z.core.$strict>,
  ]
> => z.union([inspection, z.object({ action: z.literal('propose'), candidate }).strict()]);

export const SourceAuthorInputSchema = DiscoveryModelInputSchema;

/** JSON chooses the offered contract; Cortex enforces and repairs that contract. */
const createSourceAuthorOperation = (
  candidate: z.ZodType,
  inspection: z.ZodType,
  options: ModelOperationOptions,
): Operation => {
  const schema = sourceAuthorSchema(candidate, inspection);
  return defineOperation({
    maxJsonDepth: options.maxJsonDepth,
    input: SourceAuthorInputSchema,
    output: ModelResultSchema,
    run(request, { signal }) {
      return runDiscoveryModel({
        ...options,
        request,
        schema,
        signal,
      });
    },
  });
};

/** Static typed registrations. JSON owns all calls, trials and acceptance. */
export const createSourceAuthorOperations = (options: ModelOperationOptions): Operations => ({
  'author.html': createSourceAuthorOperation(
    HtmlSourceCandidateSchema,
    HtmlSourceInspectionSchema,
    options,
  ),
  'author.xml.selection': createSourceAuthorOperation(
    XmlSelectionSchema,
    XmlSourceInspectionSchema,
    options,
  ),
  'author.output': createPrismMappingOperation(options),
  'author.reference': createPrismMappingOperation(options),
});

/** Measure text; JSON owns allowance decisions. */
export const createTextBytesOperation = (maxJsonDepth?: number): Operation =>
  defineOperation({
    maxJsonDepth,
    input: z.string(),
    output: z.number().int().nonnegative(),
    run: (value) => Buffer.byteLength(value),
  });
