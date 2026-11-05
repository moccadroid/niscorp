import { z } from 'zod';
import { MAX_NATIVE_TIMEOUT_MS } from '../../engine/control.js';

const origins = z.array(z.url()).min(1);
export const ImageChoiceProfileSchema = z
  .object({
    form: z.string().min(1),
    instruction: z.string().min(1),
    tile: z.string().min(1),
    image: z.string().min(1),
    checkbox: z.string().min(1),
    submit: z.string().min(1),
    allowedFormOrigins: origins,
    allowedImageOrigins: origins,
    continuation: z
      .object({
        form: z.string().min(1),
        allowedOrigins: origins,
        redirectStatuses: z.array(z.union([z.literal(301), z.literal(302), z.literal(303)])).min(1),
        maxRedirects: z.number().int().nonnegative(),
      })
      .strict(),
    jev: z
      .object({
        endpoint: z.url(),
        model: z.string().min(1),
        headers: z.record(z.string(), z.string()),
        question: z.string().min(1),
        trueCriterion: z.string().min(1),
        falseCriterion: z.string().min(1),
        threshold: z.number().min(0).max(1),
        selection: z.json(),
        maxMs: z.number().int().positive().max(MAX_NATIVE_TIMEOUT_MS),
      })
      .strict(),
    transport: z
      .object({
        maxMs: z.number().int().positive().max(MAX_NATIVE_TIMEOUT_MS),
        maxResponseBytes: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
export type ImageChoiceProfile = z.infer<typeof ImageChoiceProfileSchema>;
const field = z.object({ name: z.string().min(1), value: z.string() }).strict();
export const FormSchema = z
  .object({
    url: z.url(),
    referer: z.url(),
    fields: z.array(field),
  })
  .strict();
export const ChallengeSchema = z
  .object({
    pageUrl: z.url(),
    action: z.url(),
    instruction: z.string().min(1),
    hidden: z.array(field),
    submit: field,
    tiles: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string().min(1),
            value: z.string(),
            url: z.url(),
            file: z.string(),
          })
          .strict(),
      )
      .min(1),
    scripts: z.number().int().nonnegative(),
  })
  .strict();
export type ImageChallenge = z.infer<typeof ChallengeSchema>;
export const PreparedImagesSchema = z.record(
  z.string(),
  z
    .object({
      format: z.enum(['png', 'jpg', 'jpeg']),
      data_base64: z.base64().min(1),
    })
    .strict(),
);
export type PreparedImages = z.infer<typeof PreparedImagesSchema>;
export const VisionResponseSchema = z.object({
  model: z.string(),
  answers: z.record(
    z.string(),
    z.object({ type: z.literal('noul'), noul: z.number().min(0).max(1) }).strict(),
  ),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});
