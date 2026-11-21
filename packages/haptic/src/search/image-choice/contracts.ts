import { z } from 'zod';

const origins = z.array(z.url()).min(1);
// Where an image challenge's parts are on its page, and where its forms, images and redirects may go.
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
  })
  .strict();
export type ImageChoiceProfile = z.infer<typeof ImageChoiceProfileSchema>;
const field = z.object({ name: z.string().min(1), value: z.string() }).strict();
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
export type PreparedImages = Record<
  string,
  { format: 'png' | 'jpg' | 'jpeg'; data_base64: string }
>;
