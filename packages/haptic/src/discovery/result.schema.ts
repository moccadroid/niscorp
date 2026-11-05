import { z } from 'zod';

export const ResultFlowSchema = z
  .object({
    id: z.string().min(1).describe('An offered bundled result-flow ID.'),
    revision: z.number().int().positive().describe('The exact offered flow revision.'),
  })
  .strict();
export const ResultSchema = z
  .object({
    flow: ResultFlowSchema,
    input: z
      .object({
        reference: z
          .array(z.union([z.string(), z.number().int().nonnegative()]))
          .min(1)
          .describe(
            'Property path within each selected item to its resource URL, for example ["attributes","href"] for an anchor or ["attributes","content"] for URL metadata.',
          ),
      })
      .strict(),
  })
  .strict()
  .nullable()
  .describe(
    'Optional processing of selected results: a bundled flow reference and a property path to each resource URL. Null means no result-processing flow for this stage.',
  );
export const ResultFlowsSchema = z.array(
  z
    .object({
      flow: ResultFlowSchema,
      description: z.string().min(1),
    })
    .strict(),
);
export const HttpAcceptanceSchema = z
  .object({
    statuses: z.array(z.number().int().min(100).max(599)).min(1),
    mediaTypes: z.array(z.string().min(1)).nullable(),
  })
  .strict();
export const ResourcePolicySchema = z
  .object({
    allowResourceFetching: z.boolean(),
    maxResources: z.number().int().nonnegative(),
    maxRedirects: z.number().int().nonnegative(),
    stripFragments: z.boolean(),
    accept: HttpAcceptanceSchema,
  })
  .strict();

export const TraversalPolicySchema = z
  .object({
    allowLinkFollowing: z.boolean(),
    linkDepth: z.number().int().nonnegative(),
    maxPages: z.number().int().positive(),
    maxRedirects: z.number().int().nonnegative(),
    stripFragments: z.boolean(),
    accept: HttpAcceptanceSchema,
  })
  .strict();

export const FormatsSchema = z
  .array(
    z
      .object({
        id: z.enum(['html', 'json', 'xml']),
        mediaTypes: z.array(z.string().min(1)),
        mediaTypeSuffixes: z.array(z.string().min(1)),
        excludedMediaTypes: z.array(z.string().min(1)).optional(),
        urlAttributes: z
          .array(z.string().min(1))
          .optional()
          .describe(
            'Format attributes whose selected values are URL references. Field names remain dynamic.',
          ),
      })
      .strict(),
  )
  .min(1);
