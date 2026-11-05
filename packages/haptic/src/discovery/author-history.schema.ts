import { z } from 'zod';

export const AuthorMessageSchema = z
  .object({ role: z.enum(['user', 'assistant']), content: z.string() })
  .strict();
export const AuthorJobSchema = z.enum(['source', 'reference', 'contract', 'output']);
export const AuthorHistoriesSchema = z.array(
  z
    .object({
      job: AuthorJobSchema,
      scope: z.json(),
      round: z.number().int().nonnegative(),
      messages: z.array(AuthorMessageSchema),
    })
    .strict(),
);
