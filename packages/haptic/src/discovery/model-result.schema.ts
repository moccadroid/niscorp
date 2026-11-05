import { z } from 'zod';
import type { RunMeta } from '@niscorp/cortex';
import { ProviderBlockSchema } from './model-transport.js';

export const ModelUsageSchema = z
  .object({
    inputTokens: z.number().nonnegative(),
    outputTokens: z.number().nonnegative(),
    totalTokens: z.number().nonnegative(),
    reported: z.boolean(),
  })
  .strict();

export const ModelMetaSchema = z
  .object({
    usage: ModelUsageSchema,
    strategy: z.enum(['emit', 'native', 'respond']),
    steps: z.number().int().nonnegative(),
    outputRetries: z.number().int().nonnegative(),
    elapsedMs: z.number().nonnegative(),
  })
  .strict() satisfies z.ZodType<RunMeta>;

export const ModelErrorSchema = z.union([
  z.object({ code: z.string(), message: z.string() }).strict(),
  ProviderBlockSchema,
]);
export const DiscoveryReasonSchema = z.union([z.string().min(1), ProviderBlockSchema]);
export const ModelSourcesSchema = z.array(
  z
    .object({
      channel: z.enum(['content', 'tool-arguments', 'failed-generation']),
      text: z.string(),
    })
    .strict(),
);

const details = { meta: ModelMetaSchema, rawSources: ModelSourcesSchema };
export const ModelResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), decision: z.json(), error: z.null(), ...details }).strict(),
  z
    .object({ ok: z.literal(false), decision: z.null(), error: ModelErrorSchema, ...details })
    .strict(),
]);
