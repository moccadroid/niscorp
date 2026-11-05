import { z } from 'zod';
import { TaskDeclarationSchema } from './rules.schema.js';
import { TraversalPolicySchema } from './result.schema.js';
import { ReviewVerdictSchema } from './review.schema.js';
import { ModelErrorSchema, ModelMetaSchema } from './model-result.schema.js';
import { TrialResultSchema } from './trial.js';
import { ProviderBlockSchema } from './model-transport.js';

const object = z.record(z.string(), z.json());
export const ModelAllowanceSchema = z.object({ steps: z.number(), ms: z.number() }).strict();
export const ModelBudgetSchema = z
  .object({ author: ModelAllowanceSchema, review: ModelAllowanceSchema })
  .strict();
export const RecordedTrialSchema = TrialResultSchema.extend({ id: z.string() }).strict();
export const ReviewSummarySchema = z
  .object({
    ok: z.boolean(),
    decision: ReviewVerdictSchema.nullable(),
    error: ModelErrorSchema.nullable(),
    meta: ModelMetaSchema.extend({ strategy: z.enum(['emit', 'native', 'respond', 'auto']) }),
  })
  .strict();

const shared = {
  blocked: ProviderBlockSchema.nullable(),
  policy: TraversalPolicySchema,
  task: TaskDeclarationSchema.nullable(),
  review: ReviewSummarySchema.nullable(),
  partialTrial: z
    .object({ outputSchema: object, outcome: RecordedTrialSchema })
    .strict()
    .nullable(),
  limited: z.boolean(),
  author: z.object({ remaining: ModelBudgetSchema, attempt: z.number().int().positive() }).strict(),
  repair: z
    .object({ attempts: z.number().int().nonnegative(), reason: z.string().nullable() })
    .strict(),
};

/** Public output is a product contract; owned captures and job transcripts stay private. */
export const DiscoveryResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      ...shared,
      status: z.literal('ready'),
      artifact: object,
      reason: z.string().nullable(),
      outputSchema: object,
      trial: RecordedTrialSchema.extend({ status: z.literal('completed'), error: z.null() }),
    })
    .strict(),
  z
    .object({
      ...shared,
      status: z.literal('unresolved'),
      artifact: z.null(),
      reason: z.string().min(1),
      outputSchema: object.nullable(),
      trial: RecordedTrialSchema.nullable(),
    })
    .strict(),
  z
    .object({
      ...shared,
      status: z.literal('blocked'),
      artifact: z.null(),
      blocked: ProviderBlockSchema,
      reason: z.string().min(1),
      outputSchema: object.nullable(),
      trial: RecordedTrialSchema.nullable(),
    })
    .strict(),
]);
